import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AppConfig {
  openrouterApiKey: string;
  defaultModel: string;
  resize: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'pixelphoto');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  openrouterApiKey: '',
  defaultModel: 'qwen/qwen-vl-plus:free',
  resize: true,
};

export const MODELS = [
  'google/gemini-2.0-flash-lite-preview-02-05:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'qwen/qwen-vl-plus:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'google/gemma-3-27b-it:free'
];

export function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    const loaded = { ...DEFAULT_CONFIG, ...parsed };
    // Patch dead gemini model from old cached config json files
    if (loaded.defaultModel === 'google/gemini-2.0-flash-lite-preview-02-05:free') {
      loaded.defaultModel = 'qwen/qwen-vl-plus:free';
    }
    return loaded;
  } catch (error) {
    console.error('Failed to parse config file:', error);
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: AppConfig) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
