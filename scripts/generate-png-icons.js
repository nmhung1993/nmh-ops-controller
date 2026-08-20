const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for valid PNG chunks
const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createIconPNG(width, height, isMaskable = false) {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bit depth
  ihdr.writeUInt8(6, 9); // RGBA color type
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace
  const ihdrChunk = createPngChunk('IHDR', ihdr);

  // Pixel data generation with sleek gradient and server badge geometry
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;

  const cx = width / 2;
  const cy = height / 2;
  const radius = isMaskable ? width * 0.48 : width * 0.44;

  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // filter byte (none)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background color #0B0F17 to #111827
      let r = 11 + Math.floor((y / height) * 6);
      let g = 15 + Math.floor((y / height) * 9);
      let b = 23 + Math.floor((y / height) * 16);
      let a = 255;

      // Rounded rectangle corner check if not maskable
      const cornerR = width * 0.22;
      const innerX = Math.abs(x - cx) - (cx - cornerR);
      const innerY = Math.abs(y - cy) - (cy - cornerR);
      if (!isMaskable && innerX > 0 && innerY > 0) {
        const cornerDist = Math.sqrt(innerX * innerX + innerY * innerY);
        if (cornerDist > cornerR) {
          a = 0;
        }
      }

      if (a > 0) {
        // Draw Server Stack Plates
        const normY = y / height;
        const normX = x / width;

        const inServerPlate = (
          (normX >= 0.22 && normX <= 0.78) &&
          (
            (normY >= 0.25 && normY <= 0.38) ||
            (normY >= 0.44 && normY <= 0.57) ||
            (normY >= 0.63 && normY <= 0.76)
          )
        );

        if (inServerPlate) {
          r = 30; g = 41; b = 59; // Slate plate
          // LED lights on left
          if (normX >= 0.26 && normX <= 0.30) {
            r = 16; g = 185; b = 129; // Emerald green LED
          } else if (normX >= 0.32 && normX <= 0.36) {
            r = 6; g = 182; b = 212; // Cyan LED
          }
        }

        // Central Shield / Pulse Badge
        const inCenterShield = (
          dist <= width * 0.18 &&
          normY >= 0.36 && normY <= 0.64 &&
          normX >= 0.36 && normX <= 0.64
        );

        if (inCenterShield) {
          // Emerald-Cyan gradient
          r = Math.floor(16 + (x / width) * 20);
          g = Math.floor(185 - (y / height) * 40);
          b = Math.floor(129 + (x / width) * 80);
          
          // White pulse line in center
          if (Math.abs(y - cy) <= width * 0.02) {
            r = 255; g = 255; b = 255;
          }
        }

        // Ambient border ring
        if (Math.abs(dist - radius) <= width * 0.015) {
          r = 16; g = 185; b = 129;
        }
      }

      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createPngChunk('IDAT', compressedData);
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.join(__dirname, '..', 'frontend', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

console.log('Generating PWA PNG icons...');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), createIconPNG(192, 192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createIconPNG(512, 512, false));
fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), createIconPNG(512, 512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), createIconPNG(180, 180, true));
fs.writeFileSync(path.join(outDir, 'icon-180.png'), createIconPNG(180, 180, true));

// Also copy to root public/ if exists
const rootPublicIcons = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(rootPublicIcons, { recursive: true });
fs.copyFileSync(path.join(outDir, 'icon-192.png'), path.join(rootPublicIcons, 'icon-192.png'));
fs.copyFileSync(path.join(outDir, 'icon-512.png'), path.join(rootPublicIcons, 'icon-512.png'));
fs.copyFileSync(path.join(outDir, 'icon-512-maskable.png'), path.join(rootPublicIcons, 'icon-512-maskable.png'));
fs.copyFileSync(path.join(outDir, 'apple-touch-icon.png'), path.join(rootPublicIcons, 'apple-touch-icon.png'));
fs.copyFileSync(path.join(outDir, 'icon.svg'), path.join(rootPublicIcons, 'icon.svg'));

console.log('All PWA Icons generated successfully!');
