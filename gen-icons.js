const fs = require('fs');
const zlib = require('zlib');

function createPNG(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const angle = -15 * Math.PI / 180;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);

  const outerHalf = size * 0.38;
  const innerHalf = size * 0.14;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Rotate point into logo space
      const dx = x - cx, dy = y - cy;
      const rx = dx * cosA + dy * sinA;
      const ry = -dx * sinA + dy * cosA;

      const inOuter = Math.abs(rx) <= outerHalf && Math.abs(ry) <= outerHalf;
      const inInner = Math.abs(rx) <= innerHalf && Math.abs(ry) <= innerHalf;

      if (inInner) {
        // Dark hole
        pixels[i] = 26; pixels[i+1] = 26; pixels[i+2] = 46; pixels[i+3] = 255;
      } else if (inOuter) {
        // Accent color
        pixels[i] = 91; pixels[i+1] = 110; pixels[i+2] = 234; pixels[i+3] = 255;
      } else {
        // Transparent
        pixels[i+3] = 0;
      }
    }
  }

  // Build PNG
  const rowBytes = size * 4 + 1;
  const rawData = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    rawData[y * rowBytes] = 0;
    pixels.copy(rawData, y * rowBytes + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(rawData);
  const chunks = [];

  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
    }
    return (c ^ 0xFFFFFFFF) | 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const crcBuf = Buffer.alloc(4); crcBuf.writeInt32BE(crc32(Buffer.concat([typeB, data])));
    return Buffer.concat([len, typeB, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  chunks.push(makeChunk('IHDR', ihdr));
  chunks.push(makeChunk('IDAT', compressed));
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

fs.writeFileSync('icons/icon16.png', createPNG(16));
fs.writeFileSync('icons/icon48.png', createPNG(48));
fs.writeFileSync('icons/icon128.png', createPNG(128));
console.log('Angled icons generated');
