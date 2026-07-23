import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = `${root}/apps/web/public/pwa/icon-source.svg`;
const output = `${root}/apps/web/public/pwa/icons`;

await mkdir(output, { recursive: true });
await Promise.all([
  sharp(source).resize(192, 192).png().toFile(`${output}/icon-192.png`),
  sharp(source).resize(512, 512).png().toFile(`${output}/icon-512.png`),
  sharp(source)
    .resize(410, 410)
    .extend({ background: "#5b4ce0", bottom: 51, left: 51, right: 51, top: 51 })
    .png()
    .toFile(`${output}/icon-maskable-512.png`),
]);
