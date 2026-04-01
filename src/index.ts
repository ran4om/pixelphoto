#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from './config.js';
import { runQuickMode } from './core.js';
import { runOnboard } from './onboard.js';

const program = new Command();

program
  .name('pixelphoto')
  .description('AI Bulk Photo Renamer using OpenRouter Vision Models')
  .version('1.0.0');

program
  .command('onboard')
  .description('Guided setup to auto-discover free Vision AI models and configure the app')
  .action(async () => {
    await runOnboard();
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
    } else {
      console.log(chalk.blue('Current Configuration:'));
      console.log(JSON.stringify(config, null, 2));
    }
  });

program
  .command('rename')
  .description('Rename photos in a directory')
  .argument('<directory>', 'Directory containing photos')
  .option('--quick', 'Run in quick CLI mode (default for now)')
  .option('--tui', 'Run Interactive Terminal UI (Coming Soon)')
  .option('--web', 'Open local Web Server interface (Coming Soon)')
  .option('--model <model>', 'Override default model for this run')
  .option('--no-resize', 'Disable image resizing for this run')
  .action(async (directory, options) => {
    const config = loadConfig();
    if (config.provider === 'openai' && !config.openaiApiKey) {
      console.error(chalk.red('❌ Error: OpenAI API Key is missing!'));
      console.error(chalk.yellow('Run `pixelphoto onboard` first.'));
      process.exit(1);
    } else if (config.provider === 'openrouter' && !config.openrouterApiKey) {
      console.error(chalk.red('❌ Error: OpenRouter API Key is missing!'));
      console.error(chalk.yellow('Run `pixelphoto onboard` first.'));
      process.exit(1);
    }

    if (options.tui) {
      console.log(chalk.yellow('🚧 TUI mode is coming soon. Falling back to --quick mode.'));
    }
    if (options.web) {
      console.log(chalk.yellow('🚧 Web UI mode is coming soon. Falling back to --quick mode.'));
    }

    await runQuickMode(directory, options.model, options.resize === false);
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
