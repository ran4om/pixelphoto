import { spawn } from 'node:child_process';
import chalk from 'chalk';
/**
 * Opens `url` in the default browser. Logs a short hint on failure unless `silent` is true.
 */
export function openInBrowser(url, silent = false) {
    let command;
    let args;
    if (process.platform === 'darwin') {
        command = 'open';
        args = [url];
    }
    else if (process.platform === 'win32') {
        command = 'cmd';
        args = ['/c', 'start', '""', url];
    }
    else {
        command = 'xdg-open';
        args = [url];
    }
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', err => {
        if (!silent) {
            console.log(chalk.yellow('Could not open a browser automatically; open the URL manually.'));
        }
    });
}