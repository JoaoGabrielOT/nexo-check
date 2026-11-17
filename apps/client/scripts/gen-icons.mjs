// Gera os PNGs do PWA a partir de public/icons/icon.svg. Uso: node scripts/gen-icons.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const dir = new URL('../public/icons/', import.meta.url);
const out = (name) => fileURLToPath(new URL(name, dir));
const svg = readFileSync(new URL('icon.svg', dir));

// Ícones "any": o SVG já tem cantos arredondados.
for (const size of [192, 512]) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(out(`icon-${size}.png`));
}

// Maskable: fundo navy até a borda e o motivo reduzido para caber na zona segura.
const size = 512;
const inner = Math.round(size * 0.7);
const motif = await sharp(svg).resize(inner, inner).png().toBuffer();
await sharp({ create: { width: size, height: size, channels: 4, background: '#1d1a5c' } })
  .composite([{ input: motif, gravity: 'center' }])
  .png()
  .toFile(out('icon-maskable-512.png'));
