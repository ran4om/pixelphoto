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
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * Scans a directory, calls the vision model for each image, and returns a rename plan (no files moved).
 */
export async function planRenamesInDirectory(directory, options = {}) {
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
    const plan = [];
    const failed = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const fullPath = path.join(targetDir, file);
        const mimeType = mime.lookup(fullPath) || 'image/jpeg';
        try {
            let imageBuffer;
            if (shouldResize) {
                imageBuffer = await sharp(fullPath)
                    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                    .toBuffer();
            }
            else {
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
        }
        catch (error) {
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
export function applyRenamePlan(entries) {
    for (const r of entries) {
        fs.renameSync(r.oldPath, r.newPath);
    }
}
export async function runQuickMode(directory, modelFlag, noResizeFlag, yesFlag, promptOverride) {
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
    let spinner = ora(`Processing…`).start();
    let planResult;
    try {
        planResult = await planRenamesInDirectory(directory, {
            model: modelFlag,
            noResize: noResizeFlag,
            promptOverride,
            onFileProgress: ev => {
                spinner.text = `Processing ${ev.file} (${ev.index}/${ev.total})...`;
                if (ev.status === 'ok' && ev.newName) {
                    spinner.succeed(`Processed ${ev.file} -> ${chalk.green(ev.newName)}`);
                }
                else if (ev.status === 'fail') {
                    spinner.fail(`Failed ${ev.file}: ${ev.error ?? 'unknown error'}`);
                }
                if (ev.index < ev.total) {
                    spinner = ora(`Processing…`).start();
                }
            },
        });
        if (imageFiles.length > 0) {
            spinner.stop();
        }
    }
    catch (error) {
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
        applyRenamePlan(renames);
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
            applyRenamePlan(renames);
            console.log(chalk.green('Successfully renamed files!'));
        }
        else {
            console.log(chalk.red('Operation cancelled. No files were renamed.'));
        }
    });
}
