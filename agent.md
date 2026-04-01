# PixelPhoto Agent Memory

## Purpose
This acts as long-term memory for PixelPhoto development, as requested in User Global Rules. Document everything learned about the project, patterns, and instructions here.

## Project Overview
PixelPhoto is a local CLI tool designed to batch rename images using AI vision models. It runs entirely on the user's machine, though it connects to OpenRouter to utilize large cloud models.

## Architecture
- **Language**: TypeScript (Node.js). Kept modular so later we can add a Web UI or Next.js PWA using the same logic.
- **CLI Framework**: `commander`.
- **Primary AI SDK**: `openai` connecting to `https://openrouter.ai/api/v1`.
- **Important Libraries**: `sharp` (for downscaling images before upload to save API tokens), `ora` (spinners), `chalk` (colors).

## Default Supported Vision Models
The free models chosen out of the box are:
1. `google/gemini-2.0-flash-lite-preview-02-05:free`
2. `meta-llama/llama-3.2-11b-vision-instruct:free`
3. `qwen/qwen-vl-plus:free`
4. `nvidia/nemotron-nano-12b-v2-vl:free`
5. `google/gemma-3-27b-it:free`

## Development Practices
- We use ESM (`"type": "module"` in `package.json`).
- `npx tsc` is used to build before linking globally (if users want to globally install).
- For now, users enter config into `~/.config/pixelphoto/config.json`.
- Changes are pushed to github frequently.

## Notes & Discoveries
- *[2026-04-01]* Project initialized.
