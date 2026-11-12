// Rebuild from the current ConsoleUI.fdf, plus the two overlay models.
// The legacy HumanUI.mdx is not the TFT SimpleConsole used by the client.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { parseMDX, decodeBLP, getBLPImageData } = require('war3-model');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'src/ui-replacement/assets');
const source = path.join(root, '素材/人族原生控制台/UI/Console/Human');
const names = ['HumanUITile01', 'HumanUITile02', 'HumanUITile03', 'HumanUITile04',
  'HumanUITile-InventoryCover', 'HumanUITile-TimeIndicatorFrame'];
const round = value => Math.round(value * 1e6) / 1e6;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

async function main() {
  const layers = new Map(names.map(id => [id, { id, regions: [] }]));
  const models = [];
  const definition = fs.readFileSync(path.join(output, 'native/ConsoleUI.fdf'));
  const fdf = definition.toString('utf8').replace(/\/\/[^\r\n]*/g, '');
  for (const match of fdf.matchAll(/Texture\s*\{([^}]+)\}/g)) {
    const block = match[1];
    const id = /File\s+"ConsoleTexture(0[1-4])"/.exec(block)?.[1];
    const width = Number(/Width\s+([\d.]+)/.exec(block)?.[1]);
    const height = Number(/Height\s+([\d.]+)/.exec(block)?.[1]);
    const anchor = /Anchor\s+(TOPLEFT|TOPRIGHT|BOTTOMLEFT|BOTTOMRIGHT)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)/.exec(block);
    const uv = /TexCoord\s+([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(block)?.slice(1).map(Number);
    if (!id || !width || !height || !anchor || !uv) throw Error('Unsupported ConsoleUI texture definition');
    const x = anchor[1].endsWith('RIGHT') ? 0.8 + Number(anchor[2]) - width : Number(anchor[2]);
    const y = anchor[1].startsWith('TOP') ? -Number(anchor[3]) : 0.6 - Number(anchor[3]) - height;
    layers.get(`HumanUITile${id}`).regions.push({ x: x / 0.8 * 1920, y: y / 0.6 * 1080,
      width: width / 0.8 * 1920, height: height / 0.6 * 1080,
      u: uv[0], v: uv[2], uw: uv[1] - uv[0], vh: uv[3] - uv[2] });
  }
  if ([...layers.values()].reduce((n, layer) => n + layer.regions.length, 0) !== 9) throw Error('ConsoleUI texture count changed');
  for (const name of ['HumanUI-InventoryCover', 'HumanUI-TimeIndicator']) {
    const bytes = fs.readFileSync(path.join(output, 'native', name + '.mdx'));
    models.push({ file: name + '.mdx', sha256: hash(bytes) });
    const model = parseMDX(buffer(bytes));
    for (const mesh of model.Geosets) {
      const material = model.Materials[mesh.MaterialID].Layers[0];
      const texture = model.Textures[material.TextureID].Image.split('\\').pop().replace(/\.blp$/i, '');
      const layer = layers.get(texture);
      if (!layer) continue; // Animated time-of-day effects are separate game resources.
      const boneIds = new Set(mesh.Groups.flat());
      for (const bone of model.Bones.filter(b => boneIds.has(b.ObjectId))) {
        if (bone.Translation || bone.Rotation || bone.Scaling) throw Error(`Animated console mesh: ${texture}`);
      }
      if (mesh.Faces.length % 6) throw Error(`Non-quad console mesh: ${texture}`);
      for (let i = 0; i < mesh.Faces.length; i += 6) {
        const indices = [...new Set(Array.from(mesh.Faces.slice(i, i + 6)))];
        if (indices.length !== 4) throw Error(`Unexpected quad: ${texture}`);
        const points = indices.map(index => ({
          x: mesh.Vertices[index * 3] / 0.8 * 1920,
          y: (0.6 - mesh.Vertices[index * 3 + 1]) / 0.6 * 1080,
          u: mesh.TVertices[0][index * 2], v: mesh.TVertices[0][index * 2 + 1],
        }));
        const min = field => Math.min(...points.map(p => p[field]));
        const max = field => Math.max(...points.map(p => p[field]));
        const region = { x: min('x'), y: min('y'), width: max('x') - min('x'), height: max('y') - min('y'),
          u: min('u'), v: min('v'), uw: max('u') - min('u'), vh: max('v') - min('v') };
        for (const p of points) {
          if (Math.abs((p.x - region.x) / region.width - (p.u - region.u) / region.uw) > 0.0001 ||
              Math.abs((p.y - region.y) / region.height - (p.v - region.v) / region.vh) > 0.0001) {
            throw Error(`Non-axis-aligned UV mapping: ${texture}`);
          }
        }
        layer.regions.push(region);
      }
    }
  }
  const result = [];
  for (const layer of layers.values()) {
    if (!layer.regions.length) throw Error(`Missing native layout: ${layer.id}`);
    const bytes = fs.readFileSync(path.join(source, layer.id + '.blp'));
    const decoded = decodeBLP(buffer(bytes)), image = getBLPImageData(decoded, 0);
    await sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } })
      .png().toFile(path.join(output, layer.id + '.png'));
    const x = Math.min(...layer.regions.map(r => r.x)), y = Math.min(...layer.regions.map(r => r.y));
    const width = Math.max(...layer.regions.map(r => r.x + r.width)) - x;
    const height = Math.max(...layer.regions.map(r => r.y + r.height)) - y;
    result.push({ id: layer.id, textureWidth: image.width, textureHeight: image.height,
      sourceSha256: hash(bytes), x: round(x), y: round(y), width: round(width), height: round(height),
      regions: layer.regions.map(r => Object.fromEntries(Object.entries({ ...r, x: r.x - x, y: r.y - y }).map(([k, v]) => [k, round(v)]))) });
  }
  fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify({ width: 1920, height: 1080,
    coordinateSystem: { width: 0.8, height: 0.6, origin: 'bottom-left' },
    consoleDefinition: { file: 'ConsoleUI.fdf', archive: 'War3Patch.mpq', sha256: hash(definition) }, models, layers: result }, null, 2) + '\n');
  console.log(`Generated ${result.length} console layers / ${result.reduce((n, l) => n + l.regions.length, 0)} native UV regions`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
