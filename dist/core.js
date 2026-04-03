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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function resolveAndListImages(directory) {
    const targetDir = path.resolve(directory);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        throw new Error(`Directory not found or invalid: ${targetDir}`);
    }
    const files = fs.readdirSync(targetDir);
    const imageFiles = files.filter((f) => VALID_IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    return { targetDir, imageFiles };
}
/** Vision + collision resolution; does not rename files on disk. */
export async function collectRenamesForDirectory(options) {
    const config = loadConfig();
    const modelToUse = options.model ?? config.defaultModel;
    const shouldResize = options.noResize ? false : config.resize;
    const promptTemplate = getActivePresetPromptTemplate(config);
    const { targetDir, imageFiles } = resolveAndListImages(options.directory);
    const total = imageFiles.length;
    options.onProgress?.({ type: 'scan', total });
    const renames = [];
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
            const entry = {
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
        catch (error) {
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
export function applyRenames(entries) {
    for (const r of entries) {
        fs.renameSync(r.oldPath, r.newPath);
    }
}
export async function runQuickMode(directory, modelFlag, noResizeFlag, yesFlag) {
    let targetDir;
    let imageFiles;
    try {
        ({ targetDir, imageFiles } = resolveAndListImages(directory));
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(msg));
        process.exit(1);
    }
    if (imageFiles.length === 0) {
        console.log(chalk.yellow('No valid image files found in the directory.'));
        return;
    }
    console.log(chalk.blue(`Found ${imageFiles.length} image(s). Processing...`));
    let spinner = null;
    const renames = await collectRenamesForDirectory({
        directory,
        model: modelFlag,
        noResize: noResizeFlag,
        onProgress: (p) => {
            if (p.type === 'file_start') {
                spinner?.stop();
                spinner = ora(`Processing ${p.fileName} (${p.index + 1}/${p.total})...`).start();
            }
            else if (p.type === 'file_done') {
                spinner?.succeed(`Processed ${p.oldName} -> ${chalk.green(p.newName)}`);
                spinner = null;
            }
            else if (p.type === 'file_error') {
                spinner?.fail(`Failed ${p.fileName}: ${p.message}`);
                spinner = null;
            }
            else if (p.type === 'rate_limit') {
                console.log(chalk.yellow(`⚠️ Rate limited. Retrying in ${p.delayMs / 1000}s... (${p.attempt}/${p.maxRetries})`));
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
        }
        else {
            console.log(chalk.red('Operation cancelled. No files were renamed.'));
        }
    });
}
