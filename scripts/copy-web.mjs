import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '..', 'src', 'web');
const dest = path.join(__dirname, '..', 'dist', 'web');

/**
 * Recursively copy the contents of a source directory into a destination directory.
 *
 * Creates destination directories as needed and copies files and subdirectories from the source.
 * If the source directory does not exist, logs an error and terminates the process with exit code 1.
 *
 * @param {string} s - Path to the source directory.
 * @param {string} d - Path to the destination directory.
 */
function copyDir(s, d) {
  if (!fs.existsSync(s)) {
    console.error('copy-web: missing source directory:', s);
    process.exit(1);
  }
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, e.name);
    const dp = path.join(d, e.name);
    if (e.isDirectory()) {
      copyDir(sp, dp);
    } else {
      fs.copyFileSync(sp, dp);
    }
  }
}

copyDir(src, dest);
console.log('copy-web: copied to', dest);
