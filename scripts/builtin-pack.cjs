const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { readSourceLibrary } = require("./builtin-source.cjs");
const { readBuiltinTemplates } = require("./builtin-templates.cjs");

const output = path.resolve(__dirname, "../.private/builtin");
async function readLibrary() {
  const packed = await fs.readFile(path.join(output, "library.json.zlib"));
  return JSON.parse(zlib.inflateSync(packed).toString("utf8"));
}
async function buildPack() {
  const { categories, assets } = await readSourceLibrary(
    path.resolve(__dirname, "../素材"),
  );
  if (!assets.length) throw new Error("No builtin images found in 素材.");
  const legacyImages = {};
  const legacyRoot = path.resolve(__dirname, "../public/assets");
  for (const filename of await fs.readdir(legacyRoot)) {
    if (!/^(fire|ice|nature|base)-\d+\.png$/.test(filename)) continue;
    legacyImages[filename.replace(/\.png$/, "")] =
      `data:image/png;base64,${(await fs.readFile(path.join(legacyRoot, filename))).toString("base64")}`;
  }
  await fs.mkdir(output, { recursive: true });
  const templates = await readBuiltinTemplates(
    path.resolve(__dirname, "../模板"),
    { assets, legacyImages },
  );
  const compressed = zlib.deflateSync(
    Buffer.from(
      JSON.stringify({ categories, assets, legacyImages, templates }),
      "utf8",
    ),
  );
  await fs.writeFile(path.join(output, "library.json.zlib"), compressed);
  const loaded = await readLibrary();
  if (loaded.assets.length !== assets.length)
    throw new Error("Pack verification failed.");
  console.log(
    `Packed ${assets.length} builtin images and ${templates.length} initial templates (zlib, unencrypted).`,
  );
}
module.exports = { buildPack, readLibrary };
if (require.main === module)
  buildPack().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
