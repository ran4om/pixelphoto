import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import mime from 'mime-types';
import ora from 'ora';
import chalk from 'chalk';
import readline from 'readline';
import { askVisionModel, type AskVisionOptions } from './ai.js';
import { loadConfig, getActivePresetPromptTemplate } from './config.js';

export const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/** Parallel vision requests when renaming a directory (separate API calls; default 30). */
export const DEFAULT_RENAME_CONCURRENCY = 30;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type VisionOk = {
  index: number;
  file: string;
  fullPath: string;
  ext: string;
  suggestedName: string;
};

type VisionFail = {
  index: number;
  file: string;
  message: string;
};

async function runVisionForEachImage(
  targetDir: string,
  imageFiles: string[],
  options: {
    shouldResize: boolean;
    modelToUse: string;
    promptTemplate: string;
    concurrency: number;
    delayBetweenFilesMs: number;
    /** Emit vision_ok / vision_fail as each API call finishes (parallel batch UX). */
    emitVisionStreaming?: boolean;
    onProgress?: CollectRenamesOptions['onProgress'];
    onRateLimitRetry?: AskVisionOptions['onRateLimitRetry'];
  }
): Promise<(VisionOk | VisionFail)[]> {
  const total = imageFiles.length;
  const results: (VisionOk | VisionFail)[] = new Array(total);
  const concurrency = Math.min(Math.max(1, options.concurrency), Math.max(1, total));
  const emitVisionStreaming = Boolean(options.emitVisionStreaming);
  const emitFileStart = !emitVisionStreaming || concurrency === 1;
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= total) return;
      if (concurrency === 1 && i > 0 && options.delayBetweenFilesMs > 0) {
        await sleep(options.delayBetweenFilesMs);
      }

      const file = imageFiles[i];
      const fullPath = path.join(targetDir, file);
      if (emitFileStart) {
        options.onProgress?.({
          type: 'file_start',
          index: i,
          total,
          fileName: file,
        });
      }

      try {
        const mimeType = mime.lookup(fullPath) || 'image/jpeg';
        let imageBuffer: Buffer;
        if (options.shouldResize) {
          imageBuffer = await sharp(fullPath)
            .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
            .toBuffer();
        } else {
          imageBuffer = fs.readFileSync(fullPath);
        }
        const base64Image = imageBuffer.toString('base64');
        const suggestedName = await askVisionModel(base64Image, mimeType, options.modelToUse, {
          promptTemplate: options.promptTemplate,
          onRateLimitRetry: options.onRateLimitRetry,
        });
        const ext = path.extname(file);
        results[i] = { index: i, file, fullPath, ext, suggestedName };
        if (emitVisionStreaming) {
          options.onProgress?.({
            type: 'vision_ok',
            index: i,
            total,
            fileName: file,
            suggestedName,
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results[i] = { index: i, file, message };
        if (emitVisionStreaming) {
          options.onProgress?.({
            type: 'vision_fail',
            index: i,
            total,
            fileName: file,
            message,
          });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

export interface RenameEntry {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
}

export type RenameProgress =
  | { type: 'scan'; total: number }
  | { type: 'file_start'; index: number; total: number; fileName: string }
  /** One vision API call finished (parallel mode; provisional slug before collision pass). */
  | { type: 'vision_ok'; index: number; total: number; fileName: string; suggestedName: string }
  | { type: 'vision_fail'; index: number; total: number; fileName: string; message: string }
  | { type: 'file_done'; index: number; total: number; oldName: string; newName: string }
  | { type: 'file_error'; index: number; total: number; fileName: string; message: string }
  | { type: 'rate_limit'; attempt: number; maxRetries: number; delayMs: number };

export function resolveAndListImages(directory: string): { targetDir: string; imageFiles: string[] } {
  const targetDir = path.resolve(directory);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Directory not found or invalid: ${targetDir}`);
  }
  const files = fs.readdirSync(targetDir);
  const imageFiles = files.filter((f) =>
    VALID_IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase())
  );
  return { targetDir, imageFiles };
}

export interface CollectRenamesOptions {
  directory: string;
  model?: string;
  noResize?: boolean;
  /**
   * How many images to send to the vision API at once (separate HTTP requests).
   * Default 30. Use 1 with delayBetweenFilesMs to throttle like the old sequential behavior.
   */
  concurrency?: number;
  /**
   * Pause between files when concurrency is 1 (default 3000 ms). When concurrency is greater than 1, defaults to 0.
   */
  delayBetweenFilesMs?: number;
  onProgress?: (p: RenameProgress) => void;
}

function isVisionOk(v: VisionOk | VisionFail): v is VisionOk {
  return 'suggestedName' in v;
}

/** Vision + collision resolution; does not rename files on disk. */
export async function collectRenamesForDirectory(
  options: CollectRenamesOptions
): Promise<RenameEntry[]> {
  const config = loadConfig();
  const modelToUse = options.model ?? config.defaultModel;
  const shouldResize = options.noResize ? false : config.resize;
  const promptTemplate = getActivePresetPromptTemplate(config);
  const concurrency = options.concurrency ?? DEFAULT_RENAME_CONCURRENCY;
  const delayBetweenFilesMs =
    options.delayBetweenFilesMs !== undefined
      ? options.delayBetweenFilesMs
      : concurrency > 1
        ? 0
        : 3000;

  const { targetDir, imageFiles } = resolveAndListImages(options.directory);
  const total = imageFiles.length;
  options.onProgress?.({ type: 'scan', total });

  const visionResults = await runVisionForEachImage(targetDir, imageFiles, {
    shouldResize,
    modelToUse,
    promptTemplate,
    concurrency,
    delayBetweenFilesMs,
    emitVisionStreaming: concurrency > 1,
    onProgress: options.onProgress,
    onRateLimitRetry: ({ attempt, maxRetries, delayMs }) => {
      options.onProgress?.({
        type: 'rate_limit',
        attempt,
        maxRetries,
        delayMs,
      });
    },
  });

  const renames: RenameEntry[] = [];

  for (let i = 0; i < visionResults.length; i++) {
    const vr = visionResults[i];
    if (!isVisionOk(vr)) {
      options.onProgress?.({
        type: 'file_error',
        index: i,
        total,
        fileName: vr.file,
        message: vr.message,
      });
      continue;
    }

    const suggestedName = vr.suggestedName;
    const file = vr.file;
    const fullPath = vr.fullPath;
    const ext = vr.ext;

    let newFilename = `${suggestedName}${ext}`;
    let newFullPath = path.join(targetDir, newFilename);
    let counter = 1;

    while (fs.existsSync(newFullPath) || renames.some((r) => r.newName === newFilename)) {
      newFilename = `${suggestedName}-${counter}${ext}`;
      newFullPath = path.join(targetDir, newFilename);
      counter++;
    }

    const entry: RenameEntry = {
      oldPath: fullPath,
      newPath: newFullPath,
      oldName: file,
      newName: newFilename,
    };
    renames.push(entry);

    options.onProgress?.({
      type: 'file_done',
      index: i,
      total,
      oldName: file,
      newName: newFilename,
    });
  }

  return renames;
}

export type RenamePlanEntry = RenameEntry;

export type PlanRenamesOptions = {
  model?: string;
  noResize?: boolean;
  /** Overrides active preset when set (e.g. PWA custom prompt). */
  promptTemplate?: string;
  /** Pause between files when concurrency is 1 (default 3000 ms if concurrency is 1). */
  delayMs?: number;
  /** Parallel vision API calls (default 30). */
  concurrency?: number;
  onFileProgress?: (ev: {
    file: string;
    index: number;
    total: number;
    status: 'ok' | 'fail';
    newName?: string;
    error?: string;
  }) => void;
};

/**
 * Scans a directory, calls the vision model for each image, and returns a rename plan (no files moved).
 */
export async function planRenamesInDirectory(
  directory: string,
  options: PlanRenamesOptions = {}
): Promise<{ plan: RenamePlanEntry[]; failed: { file: string; error: string }[] }> {
  const config = loadConfig();
  const modelToUse = options.model ?? config.defaultModel;
  const shouldResize = options.noResize ? false : config.resize;
  const concurrency = options.concurrency ?? DEFAULT_RENAME_CONCURRENCY;
  const delayBetweenFilesMs =
    options.delayMs !== undefined
      ? options.delayMs
      : concurrency > 1
        ? 0
        : 3000;
  const promptTemplate =
    options.promptTemplate?.trim() || getActivePresetPromptTemplate(config);

  const targetDir = path.resolve(directory);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Directory not found or invalid: ${targetDir}`);
  }

  const files = fs.readdirSync(targetDir);
  const imageFiles = files.filter((f) =>
    VALID_IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase())
  );

  const visionResults = await runVisionForEachImage(targetDir, imageFiles, {
    shouldResize,
    modelToUse,
    promptTemplate,
    concurrency,
    delayBetweenFilesMs,
    onProgress: undefined,
  });

  const plan: RenamePlanEntry[] = [];
  const failed: { file: string; error: string }[] = [];
  const total = imageFiles.length;

  for (let i = 0; i < visionResults.length; i++) {
    const vr = visionResults[i];
    const file = imageFiles[i];

    if (!isVisionOk(vr)) {
      failed.push({ file, error: vr.message });
      options.onFileProgress?.({
        file,
        index: i + 1,
        total,
        status: 'fail',
        error: vr.message,
      });
      continue;
    }

    const suggestedName = vr.suggestedName;
    const fullPath = vr.fullPath;
    const ext = vr.ext;

    let newFilename = `${suggestedName}${ext}`;
    let newFullPath = path.join(targetDir, newFilename);
    let counter = 1;

    while (fs.existsSync(newFullPath) || plan.some((r) => r.newName === newFilename)) {
      newFilename = `${suggestedName}-${counter}${ext}`;
      newFullPath = path.join(targetDir, newFilename);
      counter++;
    }

    plan.push({
      oldPath: fullPath,
      newPath: newFullPath,
      oldName: file,
      newName: newFilename,
    });
    options.onFileProgress?.({
      file,
      index: i + 1,
      total,
      status: 'ok',
      newName: newFilename,
    });
  }

  return { plan, failed };
}

export function applyRenames(entries: RenameEntry[]): void {
  for (const r of entries) {
    fs.renameSync(r.oldPath, r.newPath);
  }
}

export function applyRenamePlan(entries: RenamePlanEntry[]): void {
  applyRenames(entries);
}

export async function runQuickMode(
  directory: string,
  modelFlag?: string,
  noResizeFlag?: boolean,
  yesFlag?: boolean,
  concurrency?: number
) {
  let targetDir: string;
  let imageFiles: string[];
  try {
    ({ targetDir, imageFiles } = resolveAndListImages(directory));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(chalk.red(msg));
    process.exit(1);
  }

  if (imageFiles.length === 0) {
    console.log(chalk.yellow('No valid image files found in the directory.'));
    return;
  }

  const workers = concurrency ?? DEFAULT_RENAME_CONCURRENCY;
  const parallel = workers > 1;
  let visionLiveCount = 0;

  console.log();
  console.log(
    chalk.bold.cyan('  PixelPhoto'),
    chalk.dim('·'),
    chalk.white(String(imageFiles.length)),
    chalk.dim('images')
  );
  if (parallel) {
    console.log(
      chalk.dim('  '),
      chalk.dim(`Up to ${workers} parallel vision requests · live progress below`)
    );
  } else {
    console.log(chalk.dim('  '), chalk.dim('Sequential · 3s between requests'));
  }
  console.log();

  let spinner: ReturnType<typeof ora> | null = null;

  const renames = await collectRenamesForDirectory({
    directory,
    model: modelFlag,
    noResize: noResizeFlag,
    concurrency,
    onProgress: (p) => {
      if (p.type === 'scan') {
        return;
      }
      if (p.type === 'vision_ok') {
        visionLiveCount += 1;
        console.log(
          '  ',
          chalk.green('✓'),
          chalk.dim(`[${visionLiveCount}/${p.total}]`),
          chalk.white(p.fileName),
          chalk.dim('→'),
          chalk.green(p.suggestedName)
        );
        return;
      }
      if (p.type === 'vision_fail') {
        visionLiveCount += 1;
        console.log(
          '  ',
          chalk.red('✗'),
          chalk.dim(`[${visionLiveCount}/${p.total}]`),
          chalk.white(p.fileName),
          chalk.dim('—'),
          chalk.red(p.message)
        );
        return;
      }
      if (p.type === 'rate_limit') {
        console.log(
          '  ',
          chalk.yellow(
            `⚠ Rate limited · retry in ${p.delayMs / 1000}s (${p.attempt}/${p.maxRetries})`
          )
        );
        return;
      }
      if (parallel) {
        if (p.type === 'file_done' || p.type === 'file_error') {
          return;
        }
        return;
      }
      if (p.type === 'file_start') {
        spinner?.stop();
        spinner = ora(
          chalk.dim(`${p.index + 1}/${p.total}`) + `  ${chalk.white(p.fileName)}`
        ).start();
        return;
      }
      if (p.type === 'file_done') {
        spinner?.stop();
        spinner = null;
        console.log(
          '  ',
          chalk.green('✓'),
          chalk.dim(`[${p.index + 1}/${p.total}]`),
          chalk.white(p.oldName),
          chalk.dim('→'),
          chalk.green(p.newName)
        );
        return;
      }
      if (p.type === 'file_error') {
        spinner?.stop();
        console.log(
          '  ',
          chalk.red('✗'),
          chalk.dim(`[${p.index + 1}/${p.total}]`),
          chalk.white(p.fileName),
          chalk.dim('—'),
          chalk.red(p.message)
        );
        spinner = null;
      }
    },
  });

  if (renames.length === 0) {
    console.log(chalk.yellow('\n  No files were successfully processed.'));
    return;
  }

  if (parallel) {
    console.log(
      chalk.dim(
        '\n  Tip: lines above show model output; the list below applies unique filenames on disk.\n'
      )
    );
  }

  console.log(chalk.bold('\n  ── Suggested renames ──\n'));
  renames.forEach((r) => {
    console.log(
      '  ',
      chalk.gray(r.oldName),
      chalk.dim(' → '),
      chalk.green(r.newName)
    );
  });

  if (yesFlag) {
    applyRenames(renames);
    console.log(chalk.green(`Successfully renamed ${renames.length} files!`));
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(chalk.yellow(`\nApply these ${renames.length} renames? (Y/n) `), (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() === 'y' || answer.trim() === '') {
      applyRenames(renames);
      console.log(chalk.green('Successfully renamed files!'));
    } else {
      console.log(chalk.red('Operation cancelled. No files were renamed.'));
    }
  });
}
