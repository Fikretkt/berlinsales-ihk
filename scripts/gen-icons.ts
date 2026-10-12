// Generiert PWA-Icons in 192px, 512px und 512px maskable aus einem SVG.
// Verwendung: pnpm exec tsx scripts/gen-icons.ts

import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const svg = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#22c55e"/>
  <g transform="translate(${size / 2}, ${size / 2})">
    <path
      d="M 0 ${-size * 0.28} A ${size * 0.18} ${size * 0.18} 0 1 1 0 ${size * 0.04} L 0 ${size * 0.28}"
      fill="none"
      stroke="white"
      stroke-width="${size * 0.06}"
      stroke-linecap="round"
    />
    <circle cx="0" cy="${-size * 0.1}" r="${size * 0.06}" fill="white"/>
  </g>
</svg>`;

async function main() {
  const sizes = [
    { size: 192, file: "public/icon-192.png" },
    { size: 512, file: "public/icon-512.png" },
    { size: 512, file: "public/icon-512-maskable.png", padding: 0.1 },
  ];
  for (const s of sizes) {
    const buf = Buffer.from(svg(s.size));
    const out = await sharp(buf).png().toBuffer();
    await writeFile(s.file, out);
    console.log(`  ${s.file}`);
  }
  // Apple-Touch-Icon für iOS
  const apple = await sharp(Buffer.from(svg(180))).png().toBuffer();
  await writeFile("public/apple-touch-icon.png", apple);
  console.log("  public/apple-touch-icon.png");
  // Favicon
  const fav = await sharp(Buffer.from(svg(32))).png().toBuffer();
  await writeFile("public/favicon.png", fav);
  console.log("  public/favicon.png");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
