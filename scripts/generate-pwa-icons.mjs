import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

function iconSvg(size) {
  const r = size * 0.22;
  const cx = size / 2;
  const cy = size * 0.42;
  const fontSize = Math.round(size * 0.28);
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#121212"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#34d399" stroke-width="${Math.max(4, size * 0.04)}"/>
  <path d="M ${cx} ${cy - r * 0.55} L ${cx} ${cy + r * 0.9} L ${cx - r * 0.55} ${cy + r * 0.35} Z" fill="#34d399"/>
  <text x="${cx}" y="${size * 0.78}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">AI</text>
</svg>`);
}

function maskableSvg(size) {
  const r = size * 0.16;
  const cx = size / 2;
  const cy = size * 0.46;
  const fontSize = Math.round(size * 0.2);
  return Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#121212"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#34d399" stroke-width="${Math.max(6, size * 0.03)}"/>
  <path d="M ${cx} ${cy - r * 0.55} L ${cx} ${cy + r * 0.9} L ${cx - r * 0.55} ${cy + r * 0.35} Z" fill="#34d399"/>
  <text x="${cx}" y="${size * 0.72}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">AI</text>
</svg>`);
}

async function writePng(name, svg, size) {
  const out = path.join(OUT_DIR, name);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`wrote ${out}`);
}

await mkdir(OUT_DIR, { recursive: true });
await writePng("icon-192.png", iconSvg(192), 192);
await writePng("icon-512.png", iconSvg(512), 512);
await writePng("icon-maskable-512.png", maskableSvg(512), 512);
await writePng("apple-touch-icon.png", iconSvg(180), 180);
