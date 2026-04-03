import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'src', 'web');
fs.mkdirSync(outDir, { recursive: true });

async function makePng(size, filename) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="${Math.round(size * 0.28)}" fill="white">Px</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, filename));
}

await makePng(192, 'icon-192.png');
await makePng(512, 'icon-512.png');
console.log('generate-pwa-icons: wrote icon-192.png, icon-512.png');
