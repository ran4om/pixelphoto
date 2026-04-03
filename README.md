# PixelPhoto

AI-assisted batch renaming for photos using vision models (OpenAI or OpenRouter). Ships as a **CLI**, a **local PWA** (`pixelphoto web`), and a **terminal UI** (`pixelphoto tui`, OpenTUI).

## Quick start (one-liner)

Install from [npm](https://www.npmjs.com/package/pixelphoto) and run guided setup in one go:

```bash
npm install -g pixelphoto && pixelphoto onboard
```

No global install (uses `npx`; may download the package on first run):

```bash
npx -y pixelphoto onboard
```

From GitHub (same as install + onboard):

```bash
curl -fsSL https://raw.githubusercontent.com/ran4om/pixelphoto/master/scripts/install-and-onboard.sh | bash
```

Windows (PowerShell 7+):

```powershell
npm install -g pixelphoto && pixelphoto onboard
```

## Requirements

- **Node.js** 20 or newer
- **Bun** — required for the TUI runtime (OpenTUI). Install from [bun.sh](https://bun.sh).
- An **OpenAI** or **OpenRouter** API key. Run `pixelphoto onboard` or `pixelphoto tui` to configure (`~/.config/pixelphoto/config.json`).

## Install

### Use `pixelphoto` from anywhere (global CLI)

**From a git clone** (recommended for contributors):

```bash
./scripts/install-global.sh
```

On Windows (PowerShell, from repo root):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-global.ps1
```

Or use **Make**:

```bash
make install
```

Or **npm** from the repo root (same effect as the scripts):

```bash
npm install
npm run install:global
```

That runs `npm run build` and then `npm install -g .`, which registers the `pixelphoto` command on your PATH (same as publishing locally). If the global install fails with a permissions error, fix your [npm prefix](https://docs.npmjs.com/cli/v10/configuring-npm/folders#global-installation-on-unix-systems) or use a Node version manager (nvm, fnm, etc.) so the global bin directory is under your home folder.

**After it is on npm** (once published):

```bash
npm install -g pixelphoto
```

**Uninstall** a global copy:

```bash
npm uninstall -g pixelphoto
```

### Local development only (no global command)

```bash
npm install
npm run build
```

You can still run `npx pixelphoto --help` from the repo, or use `npm link` for a dev-time global link without `npm install -g .`.

## Commands

| Command | Description |
|--------|-------------|
| `pixelphoto onboard` | Guided setup and vision-model discovery |
| `pixelphoto rename <dir>` | Quick CLI rename (default) |
| `pixelphoto rename <dir> --tui` | Full-screen TUI |
| `pixelphoto rename <dir> --web` | Start local PWA and open the browser |
| `pixelphoto web` | Start the local PWA only (settings, preview, batch rename) |
| `pixelphoto tui` | Open the full-screen TUI |
| `pixelphoto config` | View or set API key, model, resize defaults |

Common options: `--model <id>`, `--no-resize`, `-y` / `--yes` (apply renames without prompting).

## Local PWA

```bash
pixelphoto web
```

- Default URL: `http://127.0.0.1:3847`
- Use `-p <port>` to change the port.
- The server listens on **localhost only** (not exposed to the LAN).

## TUI development

```bash
bun run dev:tui
```

Smoke test (PTY): `bun run tui:smoke`

## Build

```bash
npm run build
```

Runs TypeScript compile and copies [`src/web`](src/web) into `dist/web` for the PWA.

## Test fixtures

The [`testphotos/`](testphotos/) folder contains **12** curated `fixture-01.jpg` … `fixture-12.jpg` samples (varied subjects for exercising rename). They are checked in as a one-off set; see [`testphotos/ATTRIBUTION.md`](testphotos/ATTRIBUTION.md).

[`test_rename.js`](test_rename.js) is a **development-only** helper script (not part of the published CLI).

## Security

- Vision API keys stay in local config; do not commit them.
- The web UI server accepts connections from **127.0.0.1** only.

## License

MIT — see [LICENSE](LICENSE).
