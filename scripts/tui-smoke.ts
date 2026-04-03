#!/usr/bin/env bun
/**
 * PTY smoke test for PixelPhoto OpenTUI — run: `bun tui:smoke`
 *
 * Uses util-linux `script(1)` for a pseudo-TTY. Sends SGR mouse + keyboard; asserts on output.
 * Calibrated for 120×30, `TERM=xterm-256color`.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function sgrMouse(buttonCode: number, wireX: number, wireY: number, tail: 'M' | 'm'): Buffer {
  return Buffer.from(`\x1b[<${buttonCode};${wireX};${wireY}${tail}`, 'latin1');
}

function includesBytes(haystack: Uint8Array, needle: string): boolean {
  const n = Buffer.from(needle, 'utf-8');
  const h = Buffer.isBuffer(haystack) ? haystack : Buffer.from(haystack);
  return h.includes(n);
}

function concatBuffers(chunks: Buffer[]): Buffer {
  return Buffer.concat(chunks);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function attachStdout(proc: ChildProcessWithoutNullStreams, chunks: Buffer[]): void {
  proc.stdout.on('data', (d: Buffer) => chunks.push(Buffer.from(d)));
}

function resolveBunExe(): string {
  const fromEnv = process.env.BUN_EXE?.trim();
  if (fromEnv) return fromEnv;
  return process.execPath;
}

async function main(): Promise<number> {
  const bunExe = resolveBunExe();
  const tmpHome = mkdtempSync(join(tmpdir(), 'pixelphoto-tui-smoke-'));
  const cfgDir = join(tmpHome, '.config', 'pixelphoto');
  const cfgPath = join(cfgDir, 'config.json');

  const clickRun: [number, number] = [50, 17];
  const clickConfig: [number, number] = [50, 19];

  try {
    mkdirSync(cfgDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      cfgPath,
      JSON.stringify({
        provider: 'openai',
        openaiApiKey: 'sk-smoke-test-placeholder-not-used',
        defaultModel: 'gpt-5-nano-2025-08-07',
        resize: true,
      }),
      'utf-8'
    );

    const cmd =
      `HOME=${JSON.stringify(tmpHome)} ` +
      `TERM=xterm-256color COLUMNS=120 LINES=30 ` +
      `PIXELPHOTO_ENABLE_MOUSE_MOVEMENT=1 ` +
      `exec ${JSON.stringify(bunExe)} run ${JSON.stringify(join(repoRoot, 'src/tui/dev.ts'))}`;

    const chunks: Buffer[] = [];
    const proc = spawn('script', ['-q', '-c', cmd, '/dev/null'], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: process.env.PATH ?? '/usr/bin:/bin' },
    });
    attachStdout(proc, chunks);

    let raw = Buffer.alloc(0);

    for (let i = 0; i < 150; i++) {
      await sleepMs(100);
      raw = concatBuffers(chunks);
      if (
        includesBytes(raw, 'Choose an action') &&
        includesBytes(raw, 'Preview') &&
        includesBytes(raw, 'apply vision')
      ) {
        break;
      }
    }

    if (
      !includesBytes(raw, 'Choose an action') ||
      !includesBytes(raw, 'Preview') ||
      !includesBytes(raw, 'apply vision')
    ) {
      console.error('FAIL: home screen markers not seen');
      proc.kill('SIGKILL');
      await new Promise((r) => proc.on('close', r));
      return 1;
    }

    const write = (buf: Buffer) => {
      proc.stdin.write(buf);
    };

    for (const [wx, wy] of [
      [12, 10],
      [40, 12],
      [70, 14],
      [90, 16],
      [20, 18],
      [55, 20],
      [80, 22],
    ] as [number, number][]) {
      write(sgrMouse(35, wx, wy, 'M'));
      await sleepMs(15);
    }
    await sleepMs(500);
    raw = concatBuffers(chunks);
    if (!includesBytes(raw, 'Choose an action') || !includesBytes(raw, 'Preview')) {
      console.error('FAIL: home screen lost after SGR motion');
      proc.kill('SIGKILL');
      await new Promise((r) => proc.on('close', r));
      return 1;
    }

    let [wx, wy] = clickRun;
    write(sgrMouse(0, wx, wy, 'M'));
    await sleepMs(40);
    write(sgrMouse(0, wx, wy, 'm'));
    await sleepMs(500);
    await sleepMs(1200);
    raw = concatBuffers(chunks);
    if (!includesBytes(raw, 'Model override') || !includesBytes(raw, 'Directory')) {
      console.error('FAIL: SGR click did not open Run');
      proc.kill('SIGKILL');
      await new Promise((r) => proc.on('close', r));
      return 1;
    }

    const sx = 60;
    const sy = 12;
    write(sgrMouse(65, sx, sy, 'M'));
    await sleepMs(50);
    write(sgrMouse(64, sx, sy, 'M'));
    await sleepMs(200);
    await sleepMs(400);

    write(Buffer.from('/tmp/pixelphoto-smoke-pty-path', 'utf-8'));
    await sleepMs(200);
    await sleepMs(500);

    write(Buffer.from([0x1b]));
    await sleepMs(350);
    await sleepMs(1000);
    raw = concatBuffers(chunks);
    if (!includesBytes(raw, 'Choose an action')) {
      console.error('FAIL: Esc did not return to Home from Run');
      proc.kill('SIGKILL');
      await new Promise((r) => proc.on('close', r));
      return 1;
    }

    [wx, wy] = clickConfig;
    write(sgrMouse(0, wx, wy, 'M'));
    await sleepMs(40);
    write(sgrMouse(0, wx, wy, 'm'));
    await sleepMs(500);
    await sleepMs(1200);
    raw = concatBuffers(chunks);
    if (!includesBytes(raw, 'tabselect')) {
      console.error('FAIL: SGR click did not open Configuration');
      proc.kill('SIGKILL');
      await new Promise((r) => proc.on('close', r));
      return 1;
    }

    write(Buffer.from([0x1b]));
    await sleepMs(350);
    await sleepMs(1000);
    raw = concatBuffers(chunks);
    if (!includesBytes(raw, 'Choose an action')) {
      console.error('FAIL: Esc did not return to Home from Configuration');
      proc.kill('SIGKILL');
      await new Promise((r) => proc.on('close', r));
      return 1;
    }

    proc.kill('SIGKILL');
    await new Promise((r) => proc.on('close', r));

    console.log(
      'OK: PTY smoke — SGR motion, scroll, Run + Config clicks, keyboard path, Esc navigation.'
    );
    return 0;
  } finally {
    try {
      rmSync(tmpHome, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

process.exit(await main());
