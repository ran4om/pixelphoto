import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LaunchTuiOptions {
  initialDirectory?: string;
}

function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}

/**
 * Starts the OpenTUI session. Under **Node**, spawns **Bun** on `dist/tui/dev.js` (OpenTUI expects Bun).
 * Under **Bun**, loads the TUI in-process.
 */
export async function launchPixelphotoTui(options?: LaunchTuiOptions): Promise<void> {
  // Ensure OpenTUI does not install console capture / overlay (avoids stdin garbage on Ghostty et al.)
  delete process.env.OTUI_USE_CONSOLE;

  if (options?.initialDirectory) {
    process.env.PIXELPHOTO_TUI_INITIAL_DIR = options.initialDirectory;
  } else {
    delete process.env.PIXELPHOTO_TUI_INITIAL_DIR;
  }

  if (isBunRuntime()) {
    const { runPixelphotoTui } = await import('./index.js');
    await runPixelphotoTui(options);
    return;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const devPath = path.join(here, 'dev.js');
  if (!existsSync(devPath)) {
    console.error('TUI bundle missing. Run `npm run build` or `bun run build`.');
    process.exit(1);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('bun', [devPath], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        console.error(
          'pixelphoto tui requires Bun (OpenTUI runs on the Bun runtime). Install: https://bun.sh'
        );
        process.exit(1);
      }
      reject(err);
    });
    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        process.exit(code);
      }
    });
  });
}
