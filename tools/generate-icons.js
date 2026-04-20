/* eslint-disable no-bitwise */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function hexToRgb(hex) {
  const h = String(hex || "").trim().replace(/^#/, "");
  if (h.length !== 6) throw new Error(`Hex inválido: ${hex}`);
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function mix(a, b, t) {
  const tt = clamp01(t);
  return {
    r: Math.round(a.r + (b.r - a.r) * tt),
    g: Math.round(a.g + (b.g - a.g) * tt),
    b: Math.round(a.b + (b.b - a.b) * tt)
  };
}

function blend(base, over, alpha) {
  const a = clamp01(alpha);
  return {
    r: Math.round(base.r * (1 - a) + over.r * a),
    g: Math.round(base.g * (1 - a) + over.g * a),
    b: Math.round(base.b * (1 - a) + over.b * a)
  };
}

function inRoundRect(x, y, rx, ry, rw, rh, rr) {
  // retângulo com cantos arredondados (rr = raio)
  if (x < rx || y < ry || x >= rx + rw || y >= ry + rh) return false;
  const cx = x < rx + rr ? rx + rr : x >= rx + rw - rr ? rx + rw - rr - 1 : null;
  const cy = y < ry + rr ? ry + rr : y >= ry + rh - rr ? ry + rh - rr - 1 : null;
  if (cx == null || cy == null) return true;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rr * rr;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePngRGBA(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (rowSize + 1);
    raw[rawOffset] = 0; // filter type 0
    rgbaBuffer.copy(raw, rawOffset + 1, y * rowSize, y * rowSize + rowSize);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const idat = pngChunk("IDAT", compressed);
  const iend = pngChunk("IEND", Buffer.alloc(0));
  const ihdrChunk = pngChunk("IHDR", ihdr);

  return Buffer.concat([signature, ihdrChunk, idat, iend]);
}

function drawIcon(size) {
  const bg = hexToRgb("#0f0d0b");
  const c1 = hexToRgb("#ff6a00");
  const c2 = hexToRgb("#c8945b");

  const buf = Buffer.alloc(size * size * 4);

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = size * (190 / 512);
  const r2 = r * r;

  // Barras (proporções do SVG antigo)
  const barX = Math.round(size * (152 / 512));
  const barW = Math.round(size * (208 / 512));
  const barH = Math.max(1, Math.round(size * (40 / 512)));
  const barR = Math.floor(barH / 2);

  const bar1Y = Math.round(size * (170 / 512));
  const bar2Y = Math.round(size * (236 / 512));
  const bar3Y = Math.round(size * (302 / 512));
  const bar3W = Math.round(size * (160 / 512));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = bg;

      // Círculo com gradiente diagonal
      const dx = x - cx;
      const dy = y - cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= r2) {
        const t = (x + y) / (2 * (size - 1));
        const grad = mix(c1, c2, t);
        color = blend(color, grad, 0.95);
      }

      // Barras escuras (blend)
      const in1 = inRoundRect(x, y, barX, bar1Y, barW, barH, barR);
      const in2 = inRoundRect(x, y, barX, bar2Y, barW, barH, barR);
      const in3 = inRoundRect(x, y, barX, bar3Y, bar3W, barH, barR);
      if (in1) color = blend(color, bg, 0.92);
      if (in2) color = blend(color, bg, 0.86);
      if (in3) color = blend(color, bg, 0.8);

      const i = (y * size + x) * 4;
      buf[i] = color.r;
      buf[i + 1] = color.g;
      buf[i + 2] = color.b;
      buf[i + 3] = 255;
    }
  }

  return buf;
}

function writeIconPng(outPath, size) {
  const rgba = drawIcon(size);
  const png = encodePngRGBA(size, size, rgba);
  fs.writeFileSync(outPath, png);
}

function main() {
  const root = path.join(__dirname, "..", "pwa");
  fs.mkdirSync(root, { recursive: true });

  const outputs = [
    { size: 512, name: "icon-512.png" },
    { size: 192, name: "icon-192.png" },
    { size: 180, name: "icon-180.png" },
    { size: 32, name: "icon-32.png" },
    { size: 16, name: "icon-16.png" }
  ];

  outputs.forEach(({ size, name }) => {
    const out = path.join(root, name);
    writeIconPng(out, size);
  });

  // também garante um fallback genérico
  const fallback = path.join(root, "icon.png");
  writeIconPng(fallback, 512);

  // eslint-disable-next-line no-console
  console.log("Ícones gerados em /pwa:");
  outputs.forEach(({ name }) => console.log(`- ${name}`));
  console.log("- icon.png");
}

main();
