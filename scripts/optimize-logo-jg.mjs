import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const source = path.join(process.env.USERPROFILE, 'Downloads', 'LOGO JG.png');
const out = path.join(root, 'public', 'logo-jg.png');

await mkdir(path.dirname(out), { recursive: true });

const trimmed = await sharp(source)
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .trim({ threshold: 12 })
  .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
  .toBuffer();

const result = await sharp(trimmed)
  .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9, palette: true, quality: 85 })
  .toFile(out);

console.log(`Optimized → ${out} (${(result.size / 1024).toFixed(1)} KB)`);
