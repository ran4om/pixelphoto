import fs from 'fs';
import path from 'path';
import os from 'os';
const DEFAULT_PROMPT_PRESETS = [
    {
        id: 'default',
        name: 'Default',
        description: 'Standard naming (max 6 words)',
        promptTemplate: '',
    },
    {
        id: 'short',
        name: 'Short',
        description: 'Very concise (max 3 words)',
        promptTemplate: 'Keep the filename very short, maximum 3 words. Be extremely concise.',
    },
    {
        id: 'descriptive',
        name: 'Descriptive',
        description: 'Detailed description (up to 6 words)',
        promptTemplate: 'Provide a detailed description of the image. Use up to 6 words.',
    },
];
const CONFIG_DIR = path.join(os.homedir(), '.config', 'pixelphoto');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_CONFIG = {
    provider: 'openai',
    openaiApiKey: '',
    openrouterApiKey: '',
    defaultModel: 'gpt-5-nano-2025-08-07',
    resize: true,
    promptPresets: DEFAULT_PROMPT_PRESETS,
    activePreset: 'default',
};
export function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return DEFAULT_CONFIG;
    }
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        const loaded = { ...DEFAULT_CONFIG, ...parsed };
        // Patch old default from very early builds
        if (loaded.defaultModel === 'google/gemini-2.0-flash-lite-preview-02-05:free' || loaded.defaultModel === 'gpt-4o-mini') {
            loaded.defaultModel = 'gpt-5-nano-2025-08-07';
            loaded.provider = 'openai';
        }
        // Ensure backwards compat where provider didnt exist
        if (!loaded.provider) {
            if (loaded.openrouterApiKey) {
                loaded.provider = 'openrouter';
            }
            else {
                loaded.provider = 'openai';
                loaded.defaultModel = 'gpt-5-nano-2025-08-07';
            }
        }
        // Ensure prompt presets exist with defaults
        if (!loaded.promptPresets || !Array.isArray(loaded.promptPresets)) {
            loaded.promptPresets = DEFAULT_PROMPT_PRESETS;
        }
        if (!loaded.activePreset) {
            loaded.activePreset = 'default';
        }
        return loaded;
    }
    catch (error) {
        console.error('Failed to parse config file:', error);
        return DEFAULT_CONFIG;
    }
}
export function saveConfig(config) {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
export function getActivePresetPromptTemplate(config) {
    const id = config.activePreset || 'default';
    const preset = config.promptPresets.find((p) => p.id === id);
    return preset?.promptTemplate?.trim() ?? '';
}
export function needsApiKeys(config) {
    if (config.provider === 'openai') {
        return !config.openaiApiKey?.trim();
    }
    return !config.openrouterApiKey?.trim();
}
