import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import mime from 'mime-types';
import ora from 'ora';
import chalk from 'chalk';
import readline from 'readline';
import { askVisionModel } from './ai.js';
import { loadConfig, getActivePresetPromptTemplate } from './config.js';

export const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface RenameEntry {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
}

export type RenameProgress =
  | { type: 'scan'; total: number }
  | { type: 'file_start'; index: number; total: number; fileName: string }
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
  onProgress?: (p: RenameProgress) => void;
}

/** Vision + collision resolution; does not rename files on disk. */
export async function collectRenamesForDirectory(
  options: CollectRenamesOptions
): Promise<RenameEntry[]> {
  const config = loadConfig();
  const modelToUse = options.model ?? config.defaultModel;
  const shouldResize = options.noResize ? false : config.resize;
  const promptTemplate = getActivePresetPromptTemplate(config);

  const { targetDir, imageFiles } = resolveAndListImages(options.directory);
  const total = imageFiles.length;
  options.onProgress?.({ type: 'scan', total });

  const renames: RenameEntry[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const fullPath = path.join(targetDir, file);
    const mimeType = mime.lookup(fullPath) || 'image/jpeg';

    options.onProgress?.({
      type: 'file_start',
      index: i,
      total,
      fileName: file,
    });

    try {
      let imageBuffer: Buffer;

      if (shouldResize) {
        imageBuffer = await sharp(fullPath)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();
      } else {
        imageBuffer = fs.readFileSync(fullPath);
      }

      const base64Image = imageBuffer.toString('base64');
      const suggestedName = await askVisionModel(base64Image, mimeType, modelToUse, {
        promptTemplate,
        onRateLimitRetry: ({ attempt, maxRetries, delayMs }) => {
          options.onProgress?.({
            type: 'rate_limit',
            attempt,
            maxRetries,
            delayMs,
          });
        },
      });

      const ext = path.extname(file);
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      options.onProgress?.({
        type: 'file_error',
        index: i,
        total,
        fileName: file,
        message,
      });
    }

    if (i < imageFiles.length - 1) {
      await sleep(3000);
    }
  }

  return renames;
}

export type RenamePlanEntry = RenameEntry;

export type PlanRenamesOptions = {
  model?: string;
  noResize?: boolean;
  /** Overrides active preset when set (e.g. PWA custom prompt). */
  promptTemplate?: string;
  delayMs?: number;
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
  const delayMs = options.delayMs ?? 3000;
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

  const plan: RenamePlanEntry[] = [];
  const failed: { file: string; error: string }[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const fullPath = path.join(targetDir, file);
    const mimeType = mime.lookup(fullPath) || 'image/jpeg';

    try {
      let imageBuffer: Buffer;

      if (shouldResize) {
        imageBuffer = await sharp(fullPath)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .toBuffer();
      } else {
        imageBuffer = fs.readFileSync(fullPath);
      }

      const base64Image = imageBuffer.toString('base64');
      const suggestedName = await askVisionModel(base64Image, mimeType, modelToUse, {
        promptTemplate,
      });

      const ext = path.extname(file);
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
        total: imageFiles.length,
        status: 'ok',
        newName: newFilename,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ file, error: message });
      options.onFileProgress?.({
        file,
        index: i + 1,
        total: imageFiles.length,
        status: 'fail',
        error: message,
      });
    }

    if (i < imageFiles.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
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
  yesFlag?: boolean
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

  console.log(chalk.blue(`Found ${imageFiles.length} image(s). Processing...`));

  let spinner: ReturnType<typeof ora> | null = null;

  const renames = await collectRenamesForDirectory({
    directory,
    model: modelFlag,
    noResize: noResizeFlag,
    onProgress: (p) => {
      if (p.type === 'file_start') {
        spinner?.stop();
        spinner = ora(`Processing ${p.fileName} (${p.index + 1}/${p.total})...`).start();
      } else if (p.type === 'file_done') {
        spinner?.succeed(`Processed ${p.oldName} -> ${chalk.green(p.newName)}`);
        spinner = null;
      } else if (p.type === 'file_error') {
        spinner?.fail(`Failed ${p.fileName}: ${p.message}`);
        spinner = null;
      } else if (p.type === 'rate_limit') {
        console.log(
          chalk.yellow(
            `⚠️ Rate limited. Retrying in ${p.delayMs / 1000}s... (${p.attempt}/${p.maxRetries})`
          )
        );
      }
    },
  });

  if (renames.length === 0) {
    console.log(chalk.yellow('No files were successfully processed.'));
    return;
  }

  console.log('\n' + chalk.bold('--- Rename Summary ---'));
  renames.forEach((r) => {
    console.log(`${chalk.gray(r.oldName)} -> ${chalk.green(r.newName)}`);
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
