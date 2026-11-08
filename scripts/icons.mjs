// Renders the app icons (PWA, Apple touch, maskable, favicon.ico) from public/favicon.svg.
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });
const svg = readFileSync('public/favicon.svg');
await sharp(svg, { density: 1200 }).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(svg, { density: 1200 }).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(svg, { density: 1200 })
  .resize(180, 180)
  .flatten({ background: '#1b1712' })
  .png()
  .toFile('public/icons/apple-touch-icon.png');
// Maskable: the mark inside the 80% safe zone on the app background.
const inner = await sharp(svg, { density: 1200 }).resize(330, 330).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1b1712' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile('public/icons/maskable-512.png');
// favicon.ico: a single 32 px PNG inside an ICO container.
const png = await sharp(svg, { density: 600 }).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([header, png]));
console.log('icons written');
