// Writes the hero's frames as one animated WebP.
//   node encode.cjs <framesDir> <fps> <quality> <out.webp>
//
// The first frame is encoded whole, as a still would be. Every later frame carries only the blocks
// that differ from what the viewer already has (ffmpeg's conditional replenishment), so the still
// glass costs nothing and only the phone's screen is paid for. Those later frames get a flat
// quantiser (-preset icon), four points higher: the default spends the fewest bits on the busiest
// blocks of a frame, and in a frame that is mostly empty the busiest blocks are the ones being
// sent, which then land as patches on smooth glass. ffmpeg keeps one setting for a whole file, so
// the frames are encoded with each and the first frame of one file is set in front of the later
// frames of the other.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [dir, fps, quality, out] = process.argv.slice(2);
if (!out) throw new Error('usage: node encode.cjs <framesDir> <fps> <quality> <out.webp>');

const enc = (more, to) =>
  execFileSync('ffmpeg', [
    ...['-y', '-loglevel', 'error', '-framerate', fps, '-i', path.join(dir, 'f%04d.png')],
    ...['-pix_fmt', 'yuva420p', '-c:v', 'libwebp', '-lossless', '0', '-compression_level', '6'],
    ...['-cr_threshold', '64', '-cr_size', '8', '-g', '100000', '-loop', '0'],
    ...more,
    to,
  ]);
const first = path.join(dir, 'first.webp');
const rest = path.join(dir, 'rest.webp');
enc(['-quality', quality, '-frames:v', '2'], first);
enc(['-quality', String(Math.min(100, +quality + 4)), '-preset', 'icon'], rest);

// the RIFF chunks after the 12 byte file header
const chunks = (f) => {
  const d = fs.readFileSync(f);
  const c = [];
  for (let p = 12; p < d.length; ) {
    const n = 8 + d.readUInt32LE(p + 4);
    const e = p + n + (n & 1);
    c.push(d.subarray(p, e));
    p = e;
  }
  return c;
};
const frame = (c) => c.toString('latin1', 0, 4) === 'ANMF';
const A = chunks(first);
const B = chunks(rest);
const body = Buffer.concat([
  ...B.filter((c) => !frame(c)),
  A.find(frame),
  ...B.filter(frame).slice(1),
]);
const head = Buffer.alloc(12);
head.write('RIFF', 0, 'latin1');
head.writeUInt32LE(4 + body.length, 4);
head.write('WEBP', 8, 'latin1');
fs.writeFileSync(out, Buffer.concat([head, body]));
fs.rmSync(first);
fs.rmSync(rest);
