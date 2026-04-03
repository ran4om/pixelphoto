import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, type AppConfig, type PromptPreset } from './config.js';
import { askVisionModel } from './ai.js';
import { planRenamesInDirectory, applyRenamePlan, type RenamePlanEntry } from './core.js';
import { listModelsForConfig } from './models.js';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEB_ROOT = path.join(__dirname, 'web');

/** Server-side rename plans (avoids accepting arbitrary paths in /api/apply). */
const PENDING_PLAN_TTL_MS = 60 * 60 * 1000;
const pendingRenamePlans = new Map<string, { entries: RenamePlanEntry[]; expiresAt: number }>();

/**
 * Removes expired entries from the in-memory `pendingRenamePlans` map.
 *
 * An entry is removed when its `expiresAt` timestamp is less than or equal to the current time.
 */
function prunePendingPlans(): void {
  const now = Date.now();
  for (const [id, v] of pendingRenamePlans) {
    if (v.expiresAt <= now) pendingRenamePlans.delete(id);
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Determines whether a remote IP address represents localhost.
 *
 * @param addr - The remote address string (e.g., from `req.socket.remoteAddress`)
 * @returns `true` if `addr` is exactly `127.0.0.1`, `::1`, or `::ffff:127.0.0.1`, `false` otherwise.
 */
function isLocalhost(addr: string | undefined): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * Produce a copy of an AppConfig where API keys are redacted for display.
 *
 * @param config - The original configuration object
 * @returns A new AppConfig with `openaiApiKey` and `openrouterApiKey` replaced by `••••••••` plus their last four characters when present, or an empty string when absent
 */
function maskConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    openaiApiKey: config.openaiApiKey ? '••••••••' + (config.openaiApiKey.slice(-4) || '') : '',
    openrouterApiKey: config.openrouterApiKey ? '••••••••' + (config.openrouterApiKey.slice(-4) || '') : '',
  };
}

/**
 * Merge an incoming partial AppConfig over the current config while preserving masked API keys and prompt presets when omitted.
 *
 * @param incoming - Partial config values to apply. If `openaiApiKey` or `openrouterApiKey` are present but start with `••` they are treated as masked and will not overwrite the existing keys. Omitting `promptPresets` preserves the current presets.
 * @param current - The existing full AppConfig to merge into.
 * @returns The resulting AppConfig after applying `incoming` over `current`, with masked keys and absent `promptPresets` preserved. 
 */
function stripMaskForSave(incoming: Partial<AppConfig>, current: AppConfig): AppConfig {
  const masked = (v: string | undefined) => typeof v === 'string' && v.startsWith('••');
  const next: AppConfig = {
    ...current,
    ...incoming,
    promptPresets: incoming.promptPresets ?? current.promptPresets,
  };
  if (incoming.openaiApiKey !== undefined) {
    if (!masked(incoming.openaiApiKey)) {
      next.openaiApiKey = incoming.openaiApiKey;
    }
  }
  if (incoming.openrouterApiKey !== undefined) {
    if (!masked(incoming.openrouterApiKey)) {
      next.openrouterApiKey = incoming.openrouterApiKey;
    }
  }
  return next;
}

/**
 * Parse and return the JSON body of an HTTP request while enforcing a size limit.
 *
 * @param req - The incoming HTTP request to read
 * @param maxBytes - Maximum allowed body size in bytes; exceeding this throws an Error
 * @returns The parsed JSON value, or an empty object when the body is empty or contains only whitespace
 * @throws Error when the accumulated request body exceeds `maxBytes`
 */
async function readJsonBody(req: http.IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`Body too large (max ${maxBytes} bytes)`);
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

/**
 * Send a JSON response with the given HTTP status.
 *
 * Sets `Content-Type` to `application/json; charset=utf-8` and writes the JSON-stringified `body`.
 *
 * @param res - The HTTP ServerResponse to write to
 * @param status - The HTTP status code to send
 * @param body - The value to serialize as the JSON response body
 */
function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/**
 * Sends the given file as the HTTP response with an appropriate MIME type and cache-control header.
 *
 * If the file is successfully read, responds with status 200, sets `Content-Type` based on the file extension
 * (falls back to `application/octet-stream`) and `Cache-Control: no-cache`, and writes the file bytes.
 * If the file cannot be read, responds with status 404 and the plain text body `Not found`.
 *
 * @param res - The HTTP server response to write to
 * @param filePath - Filesystem path to the file to serve
 */
function sendStatic(res: http.ServerResponse, filePath: string): void {
  const ext = path.extname(filePath);
  const type = MIME[ext] ?? 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

/**
 * Resolve a URL path (optionally containing a query) against a filesystem root and ensure the result stays inside that root.
 *
 * @param root - The filesystem directory to resolve against.
 * @param urlPath - The request URL path, which may include a query string.
 * @returns The absolute resolved path if it is inside `root`, `null` otherwise.
 */
function safeResolveInside(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const clean = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(root, clean);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return null;
  }
  return resolved;
}

/**
 * Create an HTTP server that serves the single-page application and local-only REST endpoints
 * for configuration, model interactions, previewing, rename planning/applying, and preset management.
 *
 * The returned server enforces localhost-only access and provides a static SPA fallback when no API
 * route matches.
 *
 * @returns An `http.Server` instance with handlers for the module's API routes and static file serving.
 */
export function createWebServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    const host = req.socket.remoteAddress;
    if (!isLocalhost(host)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const cors = { 'Access-Control-Allow-Origin': '*' };

    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, service: 'pixelphoto-web' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/config') {
        const config = loadConfig();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify(maskConfig(config)));
        return;
      }

      if (req.method === 'PUT' && url.pathname === '/api/config') {
        const body = (await readJsonBody(req, 512 * 1024)) as Partial<AppConfig>;
        const current = loadConfig();
        const merged = stripMaskForSave(body, current);
        if (merged.provider !== 'openai' && merged.provider !== 'openrouter') {
          sendJson(res, 400, { error: 'Invalid provider' });
          return;
        }
        saveConfig(merged);
        sendJson(res, 200, { config: maskConfig(loadConfig()) });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/models') {
        const config = loadConfig();
        const result = await listModelsForConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...cors });
        res.end(JSON.stringify(result));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/preview') {
        const body = (await readJsonBody(req, 20 * 1024 * 1024)) as {
          base64?: string;
          mimeType?: string;
          model?: string;
          prompt?: string;
        };
        if (!body.base64 || typeof body.base64 !== 'string') {
          sendJson(res, 400, { error: 'Missing base64 image' });
          return;
        }
        const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg';
        const config = loadConfig();
        const model = typeof body.model === 'string' && body.model ? body.model : config.defaultModel;
        const prompt =
          typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined;
        const slug = await askVisionModel(body.base64, mimeType, model, prompt);
        sendJson(res, 200, { slug, model });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/plan') {
        const body = (await readJsonBody(req, 16 * 1024)) as {
          directory?: string;
          model?: string;
          noResize?: boolean;
          prompt?: string;
        };
        if (!body.directory || typeof body.directory !== 'string') {
          sendJson(res, 400, { error: 'Missing directory' });
          return;
        }
        const config = loadConfig();
        const model = typeof body.model === 'string' && body.model ? body.model : config.defaultModel;
        const prompt =
          typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined;
        const { plan, failed } = await planRenamesInDirectory(body.directory, {
          model,
          noResize: Boolean(body.noResize),
          promptOverride: prompt,
        });
        prunePendingPlans();
        const planId = randomUUID();
        pendingRenamePlans.set(planId, { entries: plan, expiresAt: Date.now() + PENDING_PLAN_TTL_MS });
        const entries = plan.map(p => ({
          oldPath: p.oldPath,
          newPath: p.newPath,
          oldName: p.oldName,
          newName: p.newName,
        }));
        sendJson(res, 200, { planId, plan: entries, failed });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/apply') {
        const body = (await readJsonBody(req, 64 * 1024)) as {
          planId?: string;
        };
        const planId = typeof body.planId === 'string' ? body.planId.trim() : '';
        if (!planId) {
          sendJson(res, 400, { error: 'Missing planId. Generate a plan from the Studio first, then apply it.' });
          return;
        }
        prunePendingPlans();
        const pending = pendingRenamePlans.get(planId);
        if (!pending || pending.expiresAt <= Date.now()) {
          sendJson(res, 400, { error: 'Unknown or expired plan. Run “Generate rename plan” again.' });
          return;
        }
        const result = applyRenamePlan(pending.entries);
        pendingRenamePlans.delete(planId);
        if (!result.success) {
          sendJson(res, 400, {
            error: result.error ?? 'Rename failed',
            failedAt: result.failedAt,
            completed: result.completed.length,
          });
          return;
        }
        sendJson(res, 200, { ok: true, renamed: result.completed.length });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/presets') {
        const body = (await readJsonBody(req, 256 * 1024)) as {
          name?: string;
          prompt?: string;
        };
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const promptText = typeof body.prompt === 'string' ? body.prompt : '';
        if (!name || !promptText.trim()) {
          sendJson(res, 400, { error: 'Name and prompt are required' });
          return;
        }
        const config = loadConfig();
        const preset: PromptPreset = { id: randomUUID(), name, prompt: promptText };
        config.promptPresets = [...config.promptPresets, preset];
        saveConfig(config);
        sendJson(res, 200, { preset, config: maskConfig(config) });
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/presets/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/presets/', ''));
        if (!id) {
          sendJson(res, 400, { error: 'Missing preset id' });
          return;
        }
        const config = loadConfig();
        const next = config.promptPresets.filter(p => p.id !== id);
        if (next.length === config.promptPresets.length) {
          sendJson(res, 404, { error: 'Preset not found' });
          return;
        }
        config.promptPresets = next;
        saveConfig(config);
        sendJson(res, 200, { ok: true, config: maskConfig(config) });
        return;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: message });
      return;
    }

    // Static files (SPA fallback → index.html)
    if (req.method === 'GET') {
      let pathname = url.pathname;
      if (pathname === '/') pathname = '/index.html';
      const resolved = safeResolveInside(WEB_ROOT, pathname);
      if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        sendStatic(res, resolved);
        return;
      }
      const indexFallback = path.join(WEB_ROOT, 'index.html');
      if (fs.existsSync(indexFallback)) {
        sendStatic(res, indexFallback);
        return;
      }
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return server;
}

/**
 * Start an HTTP server bound to 127.0.0.1 using the requested port.
 *
 * If the requested port is 0, the operating system will pick an available port.
 *
 * @param port - The preferred TCP port to listen on (use 0 for an ephemeral port)
 * @returns An object with the actual `port` the server is listening on and the base `url` (e.g., `http://127.0.0.1:PORT`)
 * @throws If the server emits an `error` while starting, the promise rejects with that error
 */
export async function startWebServer(port: number): Promise<{ port: number; url: string }> {
  const server = createWebServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ port: p, url: `http://127.0.0.1:${p}` });
    });
  });
}
