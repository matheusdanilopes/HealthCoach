import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SPLASH_DIR = join(ROOT, 'public', 'splash');
mkdirSync(SPLASH_DIR, { recursive: true });

// All current iPhone portrait sizes
const devices = [
  { name: 'iphone-se',          w: 750,  h: 1334 },
  { name: 'iphone-8plus',       w: 1242, h: 2208 },
  { name: 'iphone-x',          w: 1125, h: 2436 },
  { name: 'iphone-xr',         w: 828,  h: 1792 },
  { name: 'iphone-xsmax',      w: 1242, h: 2688 },
  { name: 'iphone-12',         w: 1170, h: 2532 },
  { name: 'iphone-12max',      w: 1284, h: 2778 },
  { name: 'iphone-14pro',      w: 1179, h: 2556 },
  { name: 'iphone-14promax',   w: 1290, h: 2796 },
  { name: 'iphone-16pro',      w: 1206, h: 2622 },
  { name: 'iphone-16promax',   w: 1320, h: 2868 },
];

async function generateSplash({ name, w, h }) {
  const iconSize = Math.round(Math.min(w, h) * 0.22);
  const radius   = Math.round(iconSize * 0.24);

  // Rounded-corner mask for the icon
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}">
       <rect width="${iconSize}" height="${iconSize}" rx="${radius}" ry="${radius}" fill="white"/>
     </svg>`
  );

  const icon = await sharp(join(ROOT, 'public/icons/icon-512x512.png'))
    .resize(iconSize, iconSize)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Icon position: horizontally centered, slightly above vertical center
  const left = Math.round((w - iconSize) / 2);
  const top  = Math.round((h - iconSize) / 2) - Math.round(h * 0.05);

  // Ambient glow halo behind the icon (same green as the react splash)
  const glowR = Math.round(iconSize * 0.8);
  const glowSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <defs>
         <radialGradient id="halo" cx="50%" cy="50%" r="50%">
           <stop offset="0%"   stop-color="#34d399" stop-opacity="0.30"/>
           <stop offset="100%" stop-color="#34d399" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <circle cx="${left + iconSize / 2}" cy="${top + iconSize / 2}" r="${glowR}" fill="url(#halo)"/>
     </svg>`
  );

  // Gradient background matching the original SplashScreen component:
  // linear-gradient(160deg, #059669 0%, #064e3b 55%, #022c22 100%)
  const bgSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="0.55" y2="1.15" gradientUnits="objectBoundingBox">
           <stop offset="0%"   stop-color="#059669"/>
           <stop offset="55%"  stop-color="#064e3b"/>
           <stop offset="100%" stop-color="#022c22"/>
         </linearGradient>
       </defs>
       <rect width="${w}" height="${h}" fill="url(#g)"/>
     </svg>`
  );

  const bg = await sharp(bgSvg, { density: 72 })
    .resize(w, h)
    .png()
    .toBuffer();

  const glowBuf = await sharp(glowSvg, { density: 72 })
    .resize(w, h)
    .png()
    .toBuffer();

  await sharp(bg)
    .composite([
      { input: glowBuf, blend: 'over' },
      { input: icon,    left,  top    },
    ])
    .png({ compressionLevel: 9 })
    .toFile(join(SPLASH_DIR, `splash-${name}.png`));

  console.log(`✓  splash-${name}.png  (${w}×${h})`);
}

for (const device of devices) {
  await generateSplash(device);
}
console.log('\nAll iOS splash images generated.');
