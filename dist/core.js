import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import mime from 'mime-types';
import ora from 'ora';
import chalk from 'chalk';
import readline from 'readline';
import { askVisionModel } from './ai.js';
import { loadConfig } from './config.js';
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export async function runQuickMode(directory, modelFlag, noResizeFlag, yesFlag) {
    const config = loadConfig();
    const modelToUse = modelFlag || config.defaultModel;
    const shouldResize = noResizeFlag ? false : config.resize;
    const targetDir = path.resolve(directory);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        console.error(chalk.red(`Directory not found or invalid: ${targetDir}`));
        process.exit(1);
    }
    const files = fs.readdirSync(targetDir);
    const imageFiles = files.filter(f => VALID_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (imageFiles.length === 0) {
        console.log(chalk.yellow('No valid image files found in the directory.'));
        return;
    }
    console.log(chalk.blue(`Found ${imageFiles.length} image(s). Processing...`));
    const renames = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const fullPath = path.join(targetDir, file);
        const mimeType = mime.lookup(fullPath) || 'image/jpeg';
        const spinner = ora(`Processing ${file} (${i + 1}/${imageFiles.length})...`).start();
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
            const suggestedName = await askVisionModel(base64Image, mimeType, modelToUse);
            const ext = path.extname(file);
            let newFilename = `${suggestedName}${ext}`;
            let newFullPath = path.join(targetDir, newFilename);
            let counter = 1;
            // Handle collisions
            while (fs.existsSync(newFullPath) || renames.some(r => r.newName === newFilename)) {
                newFilename = `${suggestedName}-${counter}${ext}`;
                newFullPath = path.join(targetDir, newFilename);
                counter++;
            }
            renames.push({
                oldPath: fullPath,
                newPath: newFullPath,
                oldName: file,
                newName: newFilename
            });
            spinner.succeed(`Processed ${file} -> ${chalk.green(newFilename)}`);
        }
        catch (error) {
            spinner.fail(`Failed ${file}: ${error.message || error}`);
        }
        // Delay to respect free tier rate limits (20 RPM usually means 3 seconds is safe)
        if (i < imageFiles.length - 1) {
            await sleep(3000);
        }
    }
    if (renames.length === 0) {
        console.log(chalk.yellow('No files were successfully processed.'));
        return;
    }
    console.log('\n' + chalk.bold('--- Rename Summary ---'));
    renames.forEach(r => {
        console.log(`${chalk.gray(r.oldName)} -> ${chalk.green(r.newName)}`);
    });
    if (yesFlag) {
        for (const r of renames) {
            fs.renameSync(r.oldPath, r.newPath);
        }
        console.log(chalk.green(`Successfully renamed ${renames.length} files!`));
        return;
    }
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question(chalk.yellow(`\nApply these ${renames.length} renames? (Y/n) `), (answer) => {
        rl.close();
        if (answer.trim().toLowerCase() === 'y' || answer.trim() === '') {
            for (const r of renames) {
                fs.renameSync(r.oldPath, r.newPath);
            }
            console.log(chalk.green('Successfully renamed files!'));
        }
        else {
            console.log(chalk.red('Operation cancelled. No files were renamed.'));
        }
    });
}
