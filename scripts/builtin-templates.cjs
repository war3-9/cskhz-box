const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { buildSync } = require("esbuild");
const Module = require("node:module");

function schema() {
  const result = buildSync({
    entryPoints: [path.resolve(__dirname, "../src/project/templateSchema.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });
  const compiled = new Module(__filename, module);
  compiled._compile(result.outputFiles[0].text, __filename);
  return compiled.exports.templateSchema;
}

async function readBuiltinTemplates(root, library) {
  const defaults = JSON.parse(
    await fs.readFile(path.join(root, "defaults.json"), "utf8"),
  );
  const files = await fs.readdir(root).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const templates = [];
  const validator = schema();
  const ids = new Set();
  const assetIds = new Set(library.assets.map((asset) => asset.id));
  for (const file of files
    .filter((file) => /\.boxtemplate$/i.test(file))
    .sort()) {
    try {
      const template = validator.parse(
        JSON.parse(await fs.readFile(path.join(root, file), "utf8")),
      );
      const required = defaults.find((entry) => entry.file === file);
      if (required && template.id !== required.id)
        throw new Error("默认模板 ID 与清单不符");
      if (ids.has(template.id)) throw new Error("模板 ID 重复");
      if (template.project.document.canvasCreated === false)
        throw new Error("模板尚未创建画布");
      const check = (value) => {
        if (typeof value === "string" && value.startsWith("builtin://")) {
          const id = value.split("/")[2];
          if (
            !assetIds.has(id) &&
            !library.legacyImages?.[id.replace(/^legacy-/, "")]
          )
            throw new Error(`缺少内置素材：${id}`);
        } else if (value && typeof value === "object")
          Object.values(value).forEach(check);
      };
      check(template.project);
      await sharp(
        Buffer.from(template.preview.split(",")[1], "base64"),
      ).metadata();
      ids.add(template.id);
      templates.push(template);
    } catch (error) {
      throw new Error(`初始模板 ${file} 无效：${error.message}`);
    }
  }
  for (const entry of defaults) {
    if (!files.includes(entry.file) || !ids.has(entry.id))
      throw new Error(`缺少默认模板：${entry.file}`);
  }
  const order = (template) => {
    const index = defaults.findIndex((entry) => entry.id === template.id);
    return index < 0 ? defaults.length : index;
  };
  return templates.sort((a, b) => order(a) - order(b));
}
module.exports = { readBuiltinTemplates };
