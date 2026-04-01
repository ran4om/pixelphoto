import readline from 'readline';
import chalk from 'chalk';
import { loadConfig, saveConfig } from './config.js';
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (query) => new Promise(resolve => rl.question(query, resolve));
export async function runOnboard() {
    console.log(chalk.cyan.bold('\nWelcome to PixelPhoto Setup! 📸\n'));
    const config = loadConfig();
    // 1. Ask for API Key
    if (!config.openrouterApiKey) {
        console.log(chalk.yellow('It looks like you don\'t have an OpenRouter API key set yet.'));
        console.log(chalk.gray('You can grab a free one from https://openrouter.ai/keys'));
        const key = await question(chalk.green('Enter your OpenRouter API Key: '));
        if (key.trim()) {
            config.openrouterApiKey = key.trim();
        }
        else {
            console.log(chalk.red('❌ Skipping API key setup...'));
        }
    }
    else {
        console.log(chalk.green('✅ OpenRouter API Key is already configured.'));
        const modify = await question(chalk.yellow('Would you like to change it? (y/N): '));
        if (modify.toLowerCase() === 'y') {
            const newKey = await question(chalk.green('Enter your new OpenRouter API Key: '));
            if (newKey.trim())
                config.openrouterApiKey = newKey.trim();
        }
    }
    // 2. Fetch Live Models
    console.log(chalk.gray('Fetching available free Vision models directly from OpenRouter...'));
    let liveModels = [];
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (!res.ok)
            throw new Error(`HTTP Error: ${res.status}`);
        const data = await res.json();
        // Filter down to the exactly currently available free vision models
        liveModels = data.data
            .filter((m) => m.id.endsWith(':free') && m.architecture?.modality?.includes('image->text'))
            .map((m) => m.id);
        console.log(chalk.green(`✔ Found ${liveModels.length} compatible free vision models! 👀`));
    }
    catch (err) {
        console.log(chalk.red(`✖ Could not fetch models: ${err.message}`));
        console.log(chalk.gray('Returning to fallback defaults...'));
        liveModels = [
            'qwen/qwen-vl-plus:free',
            'meta-llama/llama-3.2-11b-vision-instruct:free',
            'google/gemma-3-27b-it:free'
        ];
    }
    // 3. Choose default model
    console.log(chalk.blue('\nAvailable models right this second:'));
    liveModels.forEach((m, idx) => {
        console.log(`  ${chalk.bold(idx + 1)}. ${m} ${m === config.defaultModel ? chalk.gray('(Current Default)') : ''}`);
    });
    const modelChoice = await question(chalk.yellow('\nChoose an index to set as your default model (or press enter to skip): '));
    const chosenIndex = parseInt(modelChoice.trim(), 10) - 1;
    if (!isNaN(chosenIndex) && chosenIndex >= 0 && chosenIndex < liveModels.length) {
        config.defaultModel = liveModels[chosenIndex];
        console.log(chalk.green(`✅ Default model updated to: ${config.defaultModel}`));
    }
    // Save config
    saveConfig(config);
    rl.close();
    console.log(chalk.cyan.bold('\n🎉 Onboarding Complete!'));
    console.log(`You can now run: ${chalk.white.bold('pixelphoto rename ./photos')} \n`);
}
