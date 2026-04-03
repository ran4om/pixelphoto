import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import React from 'react';
import { loadConfig, needsApiKeys } from '../config.js';
import { App } from './App.js';
import {
  shouldEnableMouseMovement,
  shouldUseAlternateScreen,
  shouldUseKittyKeyboard,
  shouldUseMouse,
} from './env.js';
import { theme } from './theme.js';

export interface RunTuiOptions {
  /** Pre-fill the run screen directory field */
  initialDirectory?: string;
}

/** DCS (`ESC P … ST`) and APC (`ESC _ … ST`) — terminal version / graphics protocol replies on stdin. */
function swallowDcsOrApc(sequence: string): boolean {
  return (
    /^\x1bP[\s\S]*\x1b\\$/.test(sequence) || /^\x1b_[\s\S]*\x1b\\$/.test(sequence)
  );
}

/** DECRQM response: `ESC [ ? Ps ; … $ y` (mode query report). */
function swallowDecrqmResponse(sequence: string): boolean {
  return /^\x1b\[\?[0-9;]+\$y$/.test(sequence);
}

/**
 * Kitty-style key CSI (`ESC [ … u`), including `ESC [ ?0u` (needs `?` branch).
 */
function swallowStrayKittyKeyReports(sequence: string): boolean {
  return /^\x1b\[(?:\?[0-9]+|[0-9][0-9;:]*)u$/.test(sequence);
}

/**
 * If SGR mouse reports leak through the key/sequence path (mis-parse), they must not be printed.
 * Normal mouse handling uses the `mouse` stdin event; this only runs on `prependInputHandlers`.
 */
function swallowLeakedSgrMouseReports(sequence: string): boolean {
  return /^\x1b\[<[\d;]*[Mm]$/.test(sequence);
}

/**
 * Two-param row/col CSIs: movement `…A/B/C`, CPR `…R` (cursor position report).
 * Does not match plain `ESC [ A` (no semicolon params).
 */
function swallowTwoParamCsiEndingInABCR(sequence: string): boolean {
  return /^\x1b\[[0-9]+;[0-9]+[ABCR]$/.test(sequence);
}

/**
 * CPR / cursor position report with extra params (e.g. `ESC [ 1 ; 1 ; 0 R` in some terminals).
 * OpenTUI's `parseKeypress` only treats the 2-number `…;…R` form as a non-key response.
 */
function swallowMultiParamCsiEndingInR(sequence: string): boolean {
  return /^\x1b\[[0-9][0-9;]*R$/.test(sequence);
}

/** Window resize / cell pixels: `ESC [ … t` (e.g. `4;960;1617t`). */
function swallowCsiEndingInT(sequence: string): boolean {
  return /^\x1b\[[0-9][0-9;]*t$/.test(sequence);
}

/** Device attributes response `ESC [ ? … c`. */
function swallowDeviceAttributesResponse(sequence: string): boolean {
  return /^\x1b\[\?[0-9;]+c$/.test(sequence);
}

/** CSI ending in `n` (e.g. `ESC [ ?997;2n`). */
function swallowCsiEndingInN(sequence: string): boolean {
  return /^\x1b\[\?[0-9;]+n$/.test(sequence);
}

/** Focus in/out (xterm): `ESC [ I` / `ESC [ O`. */
function swallowFocusInOut(sequence: string): boolean {
  return /^\x1b\[[IO]$/.test(sequence);
}

/** OSC (`ESC ] … BEL` or `… ST`). */
function swallowOscString(sequence: string): boolean {
  return /^\x1b\][\s\S]*(?:\x07|\x1b\\)$/.test(sequence);
}

/**
 * SS3 (`ESC O` + final byte) except common cursor / keypad keys we still want routed as keys.
 * OpenTUI may leave other SS3 sequences as printable if mis-parsed.
 */
function swallowSs3ExceptNavigation(sequence: string): boolean {
  if (!/^\x1bO[\x20-\x2f]*[\x40-\x7e]$/.test(sequence)) return false;
  if (/^\x1bO[A-D]$/.test(sequence)) return false;
  if (/^\x1bO[HF]$/.test(sequence)) return false;
  return true;
}

/**
 * ECMA-48 CSI (`ESC [` … final 0x40–0x7E) minus plain navigation / function keys that users need.
 * Catches remaining terminal responses that `parseKeypress` turns into KeyEvents and can insert into `<input>`.
 */
function swallowGenericCsiExceptNavigation(sequence: string): boolean {
  if (!/^\x1b\[(?:[\x30-\x3f]*[\x20-\x2f]*)*[\x40-\x7e]$/.test(sequence)) {
    return false;
  }
  if (/^\x1b\[[ABCDHF]$/.test(sequence)) return false;
  if (/^\x1b\[[0-9;]+~$/.test(sequence)) return false;
  return true;
}

function swallowPrependedNoise(sequence: string): boolean {
  return (
    swallowDcsOrApc(sequence) ||
    swallowDecrqmResponse(sequence) ||
    swallowStrayKittyKeyReports(sequence) ||
    swallowLeakedSgrMouseReports(sequence) ||
    swallowTwoParamCsiEndingInABCR(sequence) ||
    swallowMultiParamCsiEndingInR(sequence) ||
    swallowCsiEndingInT(sequence) ||
    swallowDeviceAttributesResponse(sequence) ||
    swallowCsiEndingInN(sequence) ||
    swallowFocusInOut(sequence) ||
    swallowOscString(sequence) ||
    swallowSs3ExceptNavigation(sequence) ||
    swallowGenericCsiExceptNavigation(sequence)
  );
}

/** Repo root: `src/tui` or `dist/tui` → project root (two levels up). */
const TUI_MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(TUI_MODULE_DIR, '..', '..');

function safeDebugSessionId(raw: string | undefined): string {
  const s = (raw ?? '').trim() || 'pixelphoto-tui';
  const cleaned = s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 64);
  return cleaned || 'pixelphoto-tui';
}

const DEBUG_SESSION_ID = safeDebugSessionId(
  process.env.PIXELPHOTO_TUI_DEBUG_SESSION
);
const DEBUG_CURSOR_DIR = join(PACKAGE_ROOT, '.cursor');
const DEBUG_NDJSON_LOG = join(
  DEBUG_CURSOR_DIR,
  `debug-${DEBUG_SESSION_ID}.log`
);

function debugNdjsonLine(payload: Record<string, unknown>): void {
  try {
    mkdirSync(DEBUG_CURSOR_DIR, { recursive: true });
    appendFileSync(
      DEBUG_NDJSON_LOG,
      JSON.stringify({
        sessionId: DEBUG_SESSION_ID,
        timestamp: Date.now(),
        ...payload,
      }) + '\n'
    );
  } catch {
    /* ignore */
  }
}

let _prependLeakCount = 0;
const PREPEND_LEAK_MAX = 40;

/**
 * Full-screen OpenTUI session. Prefers **Bun** (`bun run src/tui/dev.ts`); compiled output runs under Node.
 * Env: `PIXELPHOTO_USE_MOUSE`, `PIXELPHOTO_USE_KITTY_KEYBOARD`, `PIXELPHOTO_USE_ALTERNATE_SCREEN`, `PIXELPHOTO_ENABLE_MOUSE_MOVEMENT`.
 */
export async function runPixelphotoTui(options?: RunTuiOptions): Promise<void> {
  const initialDirectory =
    options?.initialDirectory?.trim() ||
    process.env.PIXELPHOTO_TUI_INITIAL_DIR?.trim() ||
    undefined;

  debugNdjsonLine({
    location: 'src/tui/index.tsx:runPixelphotoTui',
    message: 'tui-session-start',
    data: {
      logPath: DEBUG_NDJSON_LOG,
      pid: process.pid,
      term: process.env.TERM,
    },
    runId: 'session',
  });

  // Console overlay can capture stdin and show a `>` prompt; stray bytes (e.g. mouse CSI)
  // may appear as typed garbage. Disable it for a clean full-screen app UI.
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    screenMode: shouldUseAlternateScreen() ? 'alternate-screen' : 'main-screen',
    useMouse: shouldUseMouse(),
    enableMouseMovement: shouldEnableMouseMovement(),
    useKittyKeyboard: shouldUseKittyKeyboard() ? { events: true } : null,
    backgroundColor: theme.bg,
    autoFocus: true,
    consoleMode: 'disabled',
    openConsoleOnError: false,
    prependInputHandlers: [
      (sequence: string) => {
        const swallowed = swallowPrependedNoise(sequence);
        // #region agent log
        // Only log would-be leaks that still contain ESC (runtime: catchall swallowed stdin CSIs; no ESC in prepend-not-swallowed).
        if (
          !swallowed &&
          sequence.includes('\x1b') &&
          _prependLeakCount < PREPEND_LEAK_MAX
        ) {
          _prependLeakCount += 1;
          const line = {
            location: 'src/tui/index.tsx:prependInputHandlers',
            message: 'prepend-not-swallowed',
            hypothesisId: 'H-leak',
            data: {
              len: sequence.length,
              preview: JSON.stringify(sequence.slice(0, 160)),
            },
            runId: 'verify-stdin',
          };
          debugNdjsonLine(line);
          if (process.env.PIXELPHOTO_TUI_DEBUG_INGEST === '1') {
            fetch(
              'http://127.0.0.1:7449/ingest/f8a083c3-714e-4ba6-888c-76a8c450bb33',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Debug-Session-Id': DEBUG_SESSION_ID,
                },
                body: JSON.stringify({
                  sessionId: DEBUG_SESSION_ID,
                  ...line,
                  timestamp: Date.now(),
                }),
              }
            ).catch(() => {});
          }
        }
        // #endregion
        return swallowed;
      },
    ],
  });

  const root = createRoot(renderer);
  let shuttingDown = false;

  const shutdown = (code = 0, err?: unknown) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      root.unmount();
    } catch {
      /* ignore */
    }
    try {
      renderer.destroy();
    } catch {
      /* ignore */
    }
    if (err) {
      process.stderr.write(
        `pixelphoto tui: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
      );
      process.exitCode = code || 1;
    } else {
      process.exitCode = code;
    }
    setTimeout(() => process.exit(process.exitCode ?? code), 50).unref();
  };

  const startInOnboarding = needsApiKeys(loadConfig());

  root.render(
    <App initialDirectory={initialDirectory} startInOnboarding={startInOnboarding} />
  );

  const signalHandlers: [NodeJS.Signals, () => void][] = [
    ['SIGINT', () => shutdown(0)],
    ['SIGTERM', () => shutdown(0)],
    ['SIGHUP', () => shutdown(0)],
  ];

  for (const [sig, h] of signalHandlers) {
    process.on(sig, h);
  }

  const onErr = (e: unknown) => shutdown(1, e);
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);

  renderer.once('destroy', () => {
    for (const [sig, h] of signalHandlers) {
      process.off(sig, h);
    }
    process.off('uncaughtException', onErr);
    process.off('unhandledRejection', onErr);
  });
}
