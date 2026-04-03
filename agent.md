# PixelPhoto Agent Memory

## Purpose
This acts as long-term memory for PixelPhoto development, as requested in User Global Rules. Document everything learned about the project, patterns, and instructions here.

## Project Overview
PixelPhoto is a local CLI tool designed to batch rename images using AI vision models. It runs entirely on the user's machine, though it connects to OpenRouter to utilize large cloud models.

## Development Practices
- We use ESM (`"type": "module"` in `package.json`).
- `npx tsc` is used to build into `dist/`.
- `chalk` is used for terminal coloring in CLI mode.
- `commander` manages CLI options and subcommands.

## Notes & Discoveries
- *[2026-04-01]* Project initialized.
- CLI handles batch renaming via `src/core.ts` using OpenRouter Gemini 2.0 Flash Lite for high-speed indexing.
- Configuration is stored in `~/.pixelphoto/config.json`.
