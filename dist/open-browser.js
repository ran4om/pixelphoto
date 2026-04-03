import { exec } from 'node:child_process';
import chalk from 'chalk';
/**
 * Opens `url` in the default browser. Logs a short hint on failure unless `silent` is true.
 */
export function openInBrowser(url, silent = false) {
    const cmd = process.platform === 'darwin'
        ? `open "${url}"`
        : process.platform === 'win32'
            ? `start "" "${url}"`
            : `xdg-open "${url}"`;
    exec(cmd, err => {
        if (err && !silent) {
            console.log(chalk.yellow('Could not open a browser automatically; open the URL manually.'));
        }
    });
}
