# AGENTS.md

## Cursor Cloud specific instructions

**PixelPhoto** is a TypeScript CLI tool that batch-renames images using AI vision models. No Docker, databases, or background services are needed.

### Build & Run

- `npm run build` — compiles TypeScript to `dist/` via `tsc`.
- `node dist/index.js` — runs the built CLI. Use subcommands: `onboard`, `config`, `rename <dir>`.
- The `npm run dev` script (`ts-node --esm`) does **not** work due to `.js` extension resolution in ESM imports. Use `npx tsx src/index.ts` for dev-mode execution instead.

### Type Checking (Lint)

- `npx tsc --noEmit` — run the TypeScript compiler in check-only mode (no dedicated ESLint config exists).

### Testing

- No automated test framework is configured. The file `test_rename.js` runs a basic integration test via `npx tsx src/index.ts rename ./testphotos --quick`.
- End-to-end testing requires a valid API key (OpenAI or OpenRouter). Config is stored at `~/.config/pixelphoto/config.json`. Set it with `node dist/index.js config -k <key>` or write the JSON file directly.

### Gotchas

- The `loadConfig()` function in `src/config.ts` patches certain legacy model names (e.g. `gpt-4o-mini`, `google/gemini-2.0-flash-lite-preview-02-05:free`) back to `gpt-5-nano-2025-08-07` and forces provider to `openai`. Keep this in mind when setting test configs.
- The `config` command hangs after printing output because of a `punycode` deprecation warning interaction with the readline interface. Kill it if needed.
- `sharp` requires native `libvips` binaries; they are bundled via `@img/sharp-linux-x64` in `node_modules` and install automatically with `npm install`.
