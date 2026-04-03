import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, getActivePresetPromptTemplate, } from './config.js';
import { askVisionModel } from './ai.js';
import { planRenamesInDirectory, applyRenamePlan, } from './core.js';
import { listModelsForConfig } from './models.js';
import { randomUUID } from 'node:crypto';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(__dirname, 'web');
const MIME = {
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
function isLocalhost(addr) {
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
function maskConfig(config) {
    return {
        ...config,
        openaiApiKey: config.openaiApiKey ? '••••••••' + (config.openaiApiKey.slice(-4) || '') : '',
        openrouterApiKey: config.openrouterApiKey ? '••••••••' + (config.openrouterApiKey.slice(-4) || '') : '',
    };
}
function webConfigJson(config) {
    return {
        ...maskConfig(config),
        renamePrompt: getActivePresetPromptTemplate(config),
    };
}
function stripMaskForSave(incoming, current) {
    const masked = (v) => typeof v === 'string' && v.startsWith('••');
    const next = {
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
function applyWebPutBody(body, current) {
    const { renamePrompt, ...rest } = body;
    let next = stripMaskForSave(rest, current);
    if (typeof renamePrompt === 'string') {
        const id = next.activePreset || 'default';
        next = {
            ...next,
            promptPresets: next.promptPresets.map((p) => p.id === id ? { ...p, promptTemplate: renamePrompt } : p),
        };
    }
    return next;
}
async function readJsonBody(req, maxBytes) {
    const chunks = [];
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
    if (!raw.trim())
        return {};
    return JSON.parse(raw);
}
function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
function sendStatic(res, filePath) {
    const ext = path.extname(filePath);
    const type = MIME[ext] ?? 'application/octet-stream';
    try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(data);
    }
    catch {
        res.writeHead(404);
        res.end('Not found');
    }
}
function safeResolveInside(root, urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
    const clean = decoded.replace(/^\/+/, '');
    const resolved = path.resolve(root, clean);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return null;
    }
    return resolved;
}
export function createWebServer() {
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
                res.end(JSON.stringify(webConfigJson(config)));
                return;
            }
            if (req.method === 'PUT' && url.pathname === '/api/config') {
                const body = (await readJsonBody(req, 512 * 1024));
                const current = loadConfig();
                const merged = applyWebPutBody(body, current);
                if (merged.provider !== 'openai' && merged.provider !== 'openrouter') {
                    sendJson(res, 400, { error: 'Invalid provider' });
                    return;
                }
                saveConfig(merged);
                sendJson(res, 200, { config: webConfigJson(loadConfig()) });
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
                const body = (await readJsonBody(req, 20 * 1024 * 1024));
                if (!body.base64 || typeof body.base64 !== 'string') {
                    sendJson(res, 400, { error: 'Missing base64 image' });
                    return;
                }
                const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg';
                const config = loadConfig();
                const model = typeof body.model === 'string' && body.model ? body.model : config.defaultModel;
                const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined;
                const slug = await askVisionModel(body.base64, mimeType, model, {
                    promptTemplate: prompt,
                });
                sendJson(res, 200, { slug, model });
                return;
            }
            if (req.method === 'POST' && url.pathname === '/api/plan') {
                const body = (await readJsonBody(req, 16 * 1024));
                if (!body.directory || typeof body.directory !== 'string') {
                    sendJson(res, 400, { error: 'Missing directory' });
                    return;
                }
                const config = loadConfig();
                const model = typeof body.model === 'string' && body.model ? body.model : config.defaultModel;
                const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : undefined;
                let concurrency;
                if (body.concurrency !== undefined) {
                    const n = Number(body.concurrency);
                    if (!Number.isFinite(n) || n < 1) {
                        sendJson(res, 400, { error: 'concurrency must be a positive number' });
                        return;
                    }
                    concurrency = Math.floor(n);
                }
                const { plan, failed } = await planRenamesInDirectory(body.directory, {
                    model,
                    noResize: Boolean(body.noResize),
                    promptTemplate: prompt,
                    ...(concurrency !== undefined ? { concurrency } : {}),
                });
                const entries = plan.map(p => ({
                    oldPath: p.oldPath,
                    newPath: p.newPath,
                    oldName: p.oldName,
                    newName: p.newName,
                }));
                sendJson(res, 200, { plan: entries, failed });
                return;
            }
            if (req.method === 'POST' && url.pathname === '/api/apply') {
                const body = (await readJsonBody(req, 2 * 1024 * 1024));
                const raw = body.entries;
                if (!Array.isArray(raw) || raw.length === 0) {
                    sendJson(res, 400, { error: 'Missing entries' });
                    return;
                }
                const entries = [];
                for (const e of raw) {
                    if (!e || typeof e.oldPath !== 'string' || typeof e.newPath !== 'string') {
                        sendJson(res, 400, { error: 'Invalid entry' });
                        return;
                    }
                    const oldName = path.basename(e.oldPath);
                    const newName = path.basename(e.newPath);
                    entries.push({
                        oldPath: path.resolve(e.oldPath),
                        newPath: path.resolve(e.newPath),
                        oldName,
                        newName,
                    });
                }
                applyRenamePlan(entries);
                sendJson(res, 200, { ok: true, renamed: entries.length });
                return;
            }
            if (req.method === 'POST' && url.pathname === '/api/presets') {
                const body = (await readJsonBody(req, 256 * 1024));
                const name = typeof body.name === 'string' ? body.name.trim() : '';
                const promptText = typeof body.prompt === 'string' ? body.prompt : '';
                if (!name || !promptText.trim()) {
                    sendJson(res, 400, { error: 'Name and prompt are required' });
                    return;
                }
                const config = loadConfig();
                const preset = {
                    id: randomUUID(),
                    name,
                    description: '',
                    promptTemplate: promptText,
                };
                config.promptPresets = [...config.promptPresets, preset];
                saveConfig(config);
                sendJson(res, 200, { preset, config: webConfigJson(config) });
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
                sendJson(res, 200, { ok: true, config: webConfigJson(config) });
                return;
            }
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            sendJson(res, 500, { error: message });
            return;
        }
        // Static files (SPA fallback → index.html)
        if (req.method === 'GET') {
            let pathname = url.pathname;
            if (pathname === '/')
                pathname = '/index.html';
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
export async function startWebServer(port) {
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
