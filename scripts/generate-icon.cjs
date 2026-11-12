const fs = require("node:fs/promises");
const sharp = require("sharp");
async function main() {
  const source = await fs.readFile("src/assets/brand-logo.png");
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(
    sizes.map((size) =>
      sharp(source).resize(size, size, { fit: "contain" }).png().toBuffer(),
    ),
  );
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  images.forEach((png, index) => {
    const entry = 6 + index * 16;
    directory.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry);
    directory.writeUInt8(sizes[index] === 256 ? 0 : sizes[index], entry + 1);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await fs.mkdir("src-tauri/icons", { recursive: true });
  await fs.writeFile(
    "src-tauri/icons/icon.ico",
    Buffer.concat([directory, ...images]),
  );
  await fs.writeFile("public/icon.png", await sharp(source).png().toBuffer());
  console.log(
    `Generated community-logo ICO with ${sizes.length} Windows icon sizes.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
