const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { webFont } = require("./builtin-fonts.cjs");

const groups = [
  ["backgrounds", "底图", "底图"],
  ["frames", "方框", "格子"],
  ["rank", "品阶", "品阶"],
  ["illustrations", "插图", "插图"],
  ["props", "道具", "道具"],
  ["banners", "横幅", "横幅"],
  ["fonts", "字体", "字体"],
];
const prefix = (groupId) =>
  ["backgrounds", "frames"].includes(groupId) ? "background" : groupId;
const hash = (value, length) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
const isImage = (name) => /\.(png|jpe?g)$/i.test(name);
const isFont = (name) => /\.(ttf|otf|woff2?)$/i.test(name);
const ordered = (a, b) => a.localeCompare(b, "zh-CN", { numeric: true });

async function readSourceLibrary(root) {
  const categories = groups.map(([id, name]) => ({
    id,
    name,
    parentId: null,
    source: "builtin",
    thumbnail: "",
  }));
  const assets = [];
  const backgroundColors = [
    "黑色",
    "白色",
    "灰色",
    "蓝色",
    "绿色",
    "橙色",
    "红色",
  ];
  for (const color of backgroundColors) {
    const hex = {
      黑色: "#000000",
      白色: "#ffffff",
      灰色: "#808080",
      蓝色: "#3b82f6",
      绿色: "#22a06b",
      橙色: "#f08c2e",
      红色: "#df4b4b",
    }[color];
    const colorBytes = await sharp({
      create: { width: 256, height: 256, channels: 4, background: hex },
    })
      .png()
      .toBuffer();
    const colorImage = `data:image/png;base64,${colorBytes.toString("base64")}`;
    categories.find((category) => category.id === "backgrounds").thumbnail ||=
      colorImage;
    assets.push({
      id: `background-color-${hash(color, 24)}`,
      name: color,
      groupId: "backgrounds",
      categoryId: "backgrounds",
      source: "builtin",
      imagePath: colorImage,
      thumbnailPath: colorImage,
      width: 256,
      height: 256,
    });
  }
  for (const [groupId, , folderName] of [
    ...groups,
    ["frames", "方框", "方框"],
    ["props", "道具", "新增道具"],
  ]) {
    const directory = path.join(root, folderName);
    const entries = await fs
      .readdir(directory, { withFileTypes: true })
      .catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    if (!entries.length) continue;
    const rankOrder = ["次元", "古典", "经典", "霓虹", "炫丽", "狂野"];
    folders.sort((a, b) =>
      groupId === "rank"
        ? (rankOrder.indexOf(a) < 0 ? 999 : rankOrder.indexOf(a)) -
            (rankOrder.indexOf(b) < 0 ? 999 : rankOrder.indexOf(b)) ||
          ordered(a, b)
        : ordered(a, b),
    );
    for (const subfolder of ["", ...folders]) {
      const files = (
        await fs.readdir(path.join(directory, subfolder), {
          withFileTypes: true,
        })
      )
        .filter(
          (entry) =>
            entry.isFile() &&
            (isImage(entry.name) ||
              (groupId === "fonts" && isFont(entry.name))),
        )
        .map((entry) => entry.name)
        .sort(ordered);
      if (!files.length) continue;
      const categoryId =
        folderName === "新增道具"
          ? "props-added"
          : subfolder &&
              !["backgrounds", "props", "banners", "fonts"].includes(groupId)
            ? `${prefix(groupId)}-${hash(subfolder, 16)}`
            : groupId;
      let category = categories.find((item) => item.id === categoryId);
      if (!category) {
        category = {
          id: categoryId,
          name: folderName === "新增道具" ? "新增道具" : subfolder,
          parentId: groupId,
          source: "builtin",
          thumbnail: "",
        };
        categories.push(category);
      }
      for (const filename of files) {
        const bytes = await fs.readFile(
          path.join(directory, subfolder, filename),
        );
        if (groupId === "fonts" && isFont(filename)) {
          const id = `font-${hash(`${folderName}/${filename}`, 24)}`;
          const preview = await sharp(
            Buffer.from(
              `<svg width="480" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#eef4ff"/><text x="240" y="135" text-anchor="middle" font-family="sans-serif" font-size="42" fill="#2658a5">字体预览</text></svg>`,
            ),
          )
            .png()
            .toBuffer();
          assets.push({
            id,
            name: filename.replace(/\.[^.]+$/, ""),
            groupId,
            categoryId,
            source: "builtin",
            imagePath: `data:image/png;base64,${preview.toString("base64")}`,
            thumbnailPath: `data:image/png;base64,${preview.toString("base64")}`,
            width: 480,
            height: 240,
            kind: "font",
            fontData: `data:font/ttf;base64,${bytes.toString("base64")}`,
            webFontData: `data:font/woff2;base64,${(await webFont(bytes)).toString("base64")}`,
          });
          continue;
        }
        const metadata = await sharp(bytes).metadata();
        if (
          !["png", "jpeg"].includes(metadata.format) ||
          !metadata.width ||
          !metadata.height ||
          metadata.width * metadata.height > 40_000_000
        )
          throw new Error(
            `Unsupported image: ${folderName}/${subfolder}/${filename}`,
          );
        // The six wild ranks were previously in the root; keep their saved IDs.
        const rankFolder =
          subfolder === "狂野" && /^[1-6]\.png$/.test(filename)
            ? ""
            : subfolder;
        const identity =
          groupId === "rank"
            ? `${rankFolder}/${filename}`
            : `${folderName}/${subfolder}/${filename}`;
        const id = `${prefix(groupId)}-${hash(identity, 24)}`;
        const thumbnail = await sharp(bytes)
          .resize(240, 240, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        const thumbnailPath = `data:image/png;base64,${thumbnail.toString("base64")}`;
        category.thumbnail ||= thumbnailPath;
        assets.push({
          id,
          name: filename.replace(/\.[^.]+$/, ""),
          groupId,
          categoryId,
          source: "builtin",
          imagePath: `data:image/${metadata.format};base64,${bytes.toString("base64")}`,
          thumbnailPath,
          width: metadata.width,
          height: metadata.height,
        });
      }
    }
  }
  return { categories, assets };
}
module.exports = { readSourceLibrary };
