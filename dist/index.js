#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { loadConfig, saveConfig } from './config.js';
import { runQuickMode } from './core.js';
import { runOnboard } from './onboard.js';
import { startWebServer } from './web-server.js';
import { launchPixelphotoTui } from './tui/launch.js';
function exitIfMissingApiKeys() {
    const config = loadConfig();
    if (config.provider === 'openai' && !config.openaiApiKey) {
        console.error(chalk.red('❌ Error: OpenAI API Key is missing!'));
        console.error(chalk.yellow('Run `pixelphoto onboard` or `pixelphoto tui` to set up.'));
        process.exit(1);
    }
    if (config.provider === 'openrouter' && !config.openrouterApiKey) {
        console.error(chalk.red('❌ Error: OpenRouter API Key is missing!'));
        console.error(chalk.yellow('Run `pixelphoto onboard` or `pixelphoto tui` to set up.'));
        process.exit(1);
    }
}
const program = new Command();
program
    .name('pixelphoto')
    .description('AI Bulk Photo Renamer using OpenRouter Vision Models')
    .version('1.0.2');
program
    .command('onboard')
    .description('Guided setup to auto-discover free Vision AI models and configure the app')
    .action(async () => {
    await runOnboard();
});
program
    .command('web')
    .description('Start the local PixelPhoto PWA (settings, preview, batch rename)')
    .option('-p, --port <port>', 'Port to listen on', '3847')
    .option('--no-open', 'Do not open a browser tab')
    .action(async (options) => {
    const port = parseInt(String(options.port), 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red('Invalid port.'));
        process.exit(1);
    }
    const { url } = await startWebServer(port);
    console.log(chalk.cyan.bold('\nPixelPhoto local studio'));
    console.log(chalk.green(`  ${url}`));
    console.log(chalk.gray('  Only connections from this machine are accepted. Press Ctrl+C to stop.\n'));
    if (options.open !== false) {
        const cmd = process.platform === 'darwin'
            ? `open "${url}"`
            : process.platform === 'win32'
                ? `start "" "${url}"`
                : `xdg-open "${url}"`;
        exec(cmd, (err) => {
            if (err) {
                console.log(chalk.yellow('Could not open a browser automatically; open the URL manually.'));
            }
        });
    }
});
program
    .command('config')
    .description('Set up your OpenRouter API Key and defaults')
    .option('-k, --key <key>', 'Set OpenRouter API Key')
    .option('-m, --model <model>', 'Set default model (e.g. google/gemini-2.0-flash-lite-preview-02-05:free)')
    .option('--no-resize', 'Disable image resizing by default')
    .action((options) => {
    const config = loadConfig();
    let updated = false;
    if (options.key) {
        config.openrouterApiKey = options.key;
        updated = true;
        console.log(chalk.green('✅ API Key updated.'));
    }
    if (options.model) {
        config.defaultModel = options.model;
        updated = true;
        console.log(chalk.green(`✅ Default model set to: ${options.model}`));
    }
    if (options.resize === false) {
        config.resize = false;
        updated = true;
        console.log(chalk.green('✅ Image resizing disabled.'));
    }
    if (updated) {
        saveConfig(config);
    }
    else {
        console.log(chalk.blue('Current Configuration:'));
        console.log(JSON.stringify(config, null, 2));
    }
});
program
    .command('tui')
    .description('Open the full-screen terminal UI (OpenTUI). Prefer Bun for dev: bun run dev:tui')
    .option('-d, --directory <path>', 'Pre-fill directory on the Run screen')
    .action(async (opts) => {
    await launchPixelphotoTui({ initialDirectory: opts.directory });
});
program
    .command('rename')
    .description('Rename photos in a directory')
    .argument('<directory>', 'Directory containing photos')
    .option('--quick', 'Run in quick CLI mode (default)')
    .option('--tui', 'Open full-screen TUI instead of quick mode')
    .option('--web', 'Open local PWA in the browser (same as pixelphoto web)')
    .option('--model <model>', 'Override default model for this run')
    .option('--no-resize', 'Disable image resizing for this run')
    .option('-y, --yes', 'Skip confirmation prompt and rename files immediately')
    .action(async (directory, options) => {
    if (options.tui) {
        await launchPixelphotoTui({ initialDirectory: directory });
        return;
    }
    if (options.web) {
        exitIfMissingApiKeys();
        const port = 3847;
        const { url } = await startWebServer(port);
        console.log(chalk.cyan(`\nLocal studio: ${chalk.bold(url)}`));
        console.log(chalk.gray('Configure prompts, models, and batch renames in the browser. Press Ctrl+C to stop the server.\n'));
        const cmd = process.platform === 'darwin'
            ? `open "${url}"`
            : process.platform === 'win32'
                ? `start "" "${url}"`
                : `xdg-open "${url}"`;
        exec(cmd, () => { });
        await new Promise(() => { });
        return;
    }
    exitIfMissingApiKeys();
    await runQuickMode(directory, options.model, options.resize === false, options.yes);
});
program.parse(process.argv);
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
