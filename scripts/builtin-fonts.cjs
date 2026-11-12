const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

async function webFont(bytes) {
  const digest = crypto
    .createHash("sha256")
    .update(bytes)
    .update("woff2-v1")
    .digest("hex");
  const directory = path.resolve(__dirname, "../.private/fonts");
  const filename = path.join(directory, `${digest}.woff2`);
  try {
    return await fs.readFile(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const result = spawnSync(
    process.env.LAYERFORGE_PYTHON || "python",
    [path.join(__dirname, "normalize-font.py")],
    { input: bytes, maxBuffer: 30 * 1024 * 1024, windowsHide: true },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `FontTools conversion failed. Install fonttools[woff]==4.61.1. ${result.error?.message || result.stderr?.toString()}`,
    );
  if (result.stdout.subarray(0, 4).toString() !== "wOF2")
    throw new Error("Invalid converted font");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filename, result.stdout);
  return result.stdout;
}
module.exports = { webFont };
