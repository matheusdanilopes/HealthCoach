import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'public', 'icons');

mkdirSync(ICONS_DIR, { recursive: true });

// Premium "H with ECG crossbar" icon design
// Background: emerald gradient (top-left bright → bottom-right deep dark)
// Symbol: white two-pillar H with heartbeat crossbar

const buildSVG = (maskable = false) => {
  const rx = maskable ? 0 : 115;
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
    <linearGradient id="bgm" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)" rx="${rx}"/>
  <!-- Left pillar of H -->
  <rect x="104" y="124" width="72" height="264" rx="36" fill="white"/>
  <!-- Right pillar of H -->
  <rect x="336" y="124" width="72" height="264" rx="36" fill="white"/>
  <!-- ECG crossbar: flat → rise → deep valley → tall peak → return → flat -->
  <path d="M176,256 L212,256 L230,200 L257,316 L278,224 L298,256 L336,256"
    fill="none" stroke="white" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};

// Favicon SVG — slightly simplified for tiny sizes
const FAVICON_SVG = `<svg width="32" height="32" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)" rx="115"/>
  <rect x="104" y="124" width="72" height="264" rx="36" fill="white"/>
  <rect x="336" y="124" width="72" height="264" rx="36" fill="white"/>
  <path d="M176,256 L212,256 L230,200 L257,316 L278,224 L298,256 L336,256"
    fill="none" stroke="white" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function buildIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * numImages;

  let offset = dataOffset;
  const entries = pngBuffers.map((buf, i) => {
    const entry = { size: sizes[i], buffer: buf, offset };
    offset += buf.length;
    return entry;
  });

  const ico = Buffer.alloc(offset);
  // ICO header
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(numImages, 4);

  // Directory entries
  let pos = headerSize;
  for (const { size, buffer, offset: imgOffset } of entries) {
    ico.writeUInt8(size >= 256 ? 0 : size, pos);
    ico.writeUInt8(size >= 256 ? 0 : size, pos + 1);
    ico.writeUInt8(0, pos + 2);
    ico.writeUInt8(0, pos + 3);
    ico.writeUInt16LE(1, pos + 4);
    ico.writeUInt16LE(32, pos + 6);
    ico.writeUInt32LE(buffer.length, pos + 8);
    ico.writeUInt32LE(imgOffset, pos + 12);
    pos += entrySize;
  }

  for (const { buffer, offset: imgOffset } of entries) {
    buffer.copy(ico, imgOffset);
  }

  return ico;
}

async function main() {
  const regularSVG = buildSVG(false);
  const maskableSVG = buildSVG(true);

  const PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

  // PWA icons (rounded background)
  for (const size of PWA_SIZES) {
    await sharp(Buffer.from(regularSVG))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(join(ICONS_DIR, `icon-${size}x${size}.png`));
    console.log(`  icon-${size}x${size}.png`);
  }

  // Maskable icon — full bleed for Android adaptive
  await sharp(Buffer.from(maskableSVG))
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(join(ICONS_DIR, 'icon-512x512-maskable.png'));
  console.log('  icon-512x512-maskable.png');

  // Save master SVG files
  writeFileSync(join(ICONS_DIR, 'icon.svg'), regularSVG);
  writeFileSync(join(ICONS_DIR, 'icon-maskable.svg'), maskableSVG);
  console.log('  icon.svg / icon-maskable.svg');

  // App icon for Next.js metadata (src/app/icon.png)
  await sharp(Buffer.from(regularSVG))
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(join(ROOT, 'src', 'app', 'icon.png'));
  console.log('  src/app/icon.png');

  // favicon.ico (32x32 + 16x16 PNG-in-ICO)
  const [png32, png16] = await Promise.all([
    sharp(Buffer.from(FAVICON_SVG)).resize(32, 32).png().toBuffer(),
    sharp(Buffer.from(FAVICON_SVG)).resize(16, 16).png().toBuffer(),
  ]);
  const ico = buildIco([png32, png16], [32, 16]);
  writeFileSync(join(ROOT, 'src', 'app', 'favicon.ico'), ico);
  console.log('  src/app/favicon.ico');

  console.log('\nAll icons generated successfully.');
}

main().catch((err) => { console.error(err); process.exit(1); });
