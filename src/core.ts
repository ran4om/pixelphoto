import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import mime from 'mime-types';
import ora from 'ora';
import chalk from 'chalk';
import readline from 'readline';
import { askVisionModel } from './ai.js';
import { loadConfig } from './config.js';

export const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type RenamePlanEntry = {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
};

export type PlanRenamesOptions = {
  model?: string;
  noResize?: boolean;
  promptOverride?: string;
  /** Delay between vision API calls (default 3000). Set 0 for tests or fast paid tiers. */
  delayMs?: number;
  /** Optional per-file progress (used by CLI for spinners). */
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

  const targetDir = path.resolve(directory);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Directory not found or invalid: ${targetDir}`);
  }

  const files = fs.readdirSync(targetDir);
  const imageFiles = files.filter(f => VALID_IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));

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
      const suggestedName = await askVisionModel(base64Image, mimeType, modelToUse, options.promptOverride);

      const ext = path.extname(file);
      let newFilename = `${suggestedName}${ext}`;
      let newFullPath = path.join(targetDir, newFilename);
      let counter = 1;

      while (fs.existsSync(newFullPath) || plan.some(r => r.newName === newFilename)) {
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

export type ApplyRenamePlanResult = {
  success: boolean;
  completed: RenamePlanEntry[];
  failedAt?: RenamePlanEntry;
  error?: string;
};

/**
 * Validates the plan, applies renames in order, and rolls back on first failure.
 */
export function applyRenamePlan(entries: RenamePlanEntry[]): ApplyRenamePlanResult {
  const completed: RenamePlanEntry[] = [];

  const preflight = (): { ok: true } | { ok: false; at: RenamePlanEntry; error: string } => {
    const seenOld = new Set<string>();
    const seenNew = new Set<string>();
    for (const r of entries) {
      const o = path.resolve(r.oldPath);
      const n = path.resolve(r.newPath);
      if (seenOld.has(o)) {
        return { ok: false, at: r, error: `Duplicate source in plan: ${r.oldName}` };
      }
      if (seenNew.has(n)) {
        return { ok: false, at: r, error: `Duplicate destination in plan: ${r.newName}` };
      }
      seenOld.add(o);
      seenNew.add(n);
      if (!fs.existsSync(o)) {
        return { ok: false, at: r, error: `Source does not exist: ${r.oldPath}` };
      }
      if (!fs.statSync(o).isFile()) {
        return { ok: false, at: r, error: `Source is not a file: ${r.oldPath}` };
      }
      if (fs.existsSync(n)) {
        return { ok: false, at: r, error: `Destination already exists: ${r.newPath}` };
      }
    }
    return { ok: true };
  };

  const check = preflight();
  if (!check.ok) {
    return { success: false, completed: [], failedAt: check.at, error: check.error };
  }

  for (const r of entries) {
    try {
      fs.renameSync(r.oldPath, r.newPath);
      completed.push(r);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      for (let i = completed.length - 1; i >= 0; i--) {
        const c = completed[i];
        try {
          fs.renameSync(c.newPath, c.oldPath);
        } catch {
          /* best-effort rollback */
        }
      }
      return { success: false, completed: [], failedAt: r, error: message };
    }
  }

  return { success: true, completed: entries };
}

export async function runQuickMode(
  directory: string,
  modelFlag?: string,
  noResizeFlag?: boolean,
  yesFlag?: boolean,
  promptOverride?: string
) {
  const targetDir = path.resolve(directory);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(chalk.red(`Directory not found or invalid: ${targetDir}`));
    process.exit(1);
  }

  const files = fs.readdirSync(targetDir);
  const imageFiles = files.filter(f => VALID_IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));

  if (imageFiles.length === 0) {
    console.log(chalk.yellow('No valid image files found in the directory.'));
    return;
  }

  console.log(chalk.blue(`Found ${imageFiles.length} image(s). Processing...`));
  const spinner = ora(`Processing…`).start();

  let planResult: Awaited<ReturnType<typeof planRenamesInDirectory>>;
  try {
    planResult = await planRenamesInDirectory(directory, {
      model: modelFlag,
      noResize: noResizeFlag,
      promptOverride,
      onFileProgress: ev => {
        spinner.text = `Processing ${ev.file} (${ev.index}/${ev.total})...`;
        if (ev.status === 'ok' && ev.newName) {
          spinner.succeed(`Processed ${ev.file} -> ${chalk.green(ev.newName)}`);
        } else if (ev.status === 'fail') {
          spinner.fail(`Failed ${ev.file}: ${ev.error ?? 'unknown error'}`);
        }
        if (ev.index < ev.total) {
          spinner.start('Processing…');
        }
      },
    });
    if (imageFiles.length > 0) {
      spinner.stop();
    }
  } catch (error: unknown) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const { plan: renames, failed } = planResult;
  failed.forEach(f => {
    console.log(chalk.red(`Failed ${f.file}: ${f.error}`));
  });

  if (renames.length === 0) {
    console.log(chalk.yellow('No files were successfully processed.'));
    return;
  }

  console.log('\n' + chalk.bold('--- Rename Summary ---'));
  renames.forEach(r => {
    console.log(`${chalk.gray(r.oldName)} -> ${chalk.green(r.newName)}`);
  });

  if (yesFlag) {
    const applied = applyRenamePlan(renames);
    if (!applied.success) {
      console.error(chalk.red(`Rename failed: ${applied.error ?? 'unknown error'}`));
      return;
    }
    console.log(chalk.green(`Successfully renamed ${renames.length} files!`));
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(chalk.yellow(`\nApply these ${renames.length} renames? (Y/n) `), answer => {
    rl.close();
    if (answer.trim().toLowerCase() === 'y' || answer.trim() === '') {
      const applied = applyRenamePlan(renames);
      if (!applied.success) {
        console.error(chalk.red(`Rename failed: ${applied.error ?? 'unknown error'}`));
        return;
      }
      console.log(chalk.green('Successfully renamed files!'));
    } else {
      console.log(chalk.red('Operation cancelled. No files were renamed.'));
    }
  });
}
