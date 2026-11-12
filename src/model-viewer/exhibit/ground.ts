import * as THREE from 'three';
export function checkerImage() {
  const bytes = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const color = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? [51, 51, 60] : [38, 38, 46]; bytes.set([...color, 255], (y * 64 + x) * 4); }
  return new ImageData(bytes, 64, 64);
}
export class ExhibitGround {
  readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  private texture?: THREE.DataTexture;
  private repeat = 1;
  constructor() { this.image(checkerImage()); }
  image(image?: ImageData) {
    this.texture?.dispose(); this.texture = undefined;
    if (image) { this.texture = new THREE.DataTexture(image.data, image.width, image.height); this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping; this.texture.magFilter = THREE.LinearFilter; this.texture.minFilter = THREE.LinearMipmapLinearFilter; this.texture.generateMipmaps = true; this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.needsUpdate = true; }
    this.texture?.repeat.set(this.repeat, this.repeat);
    this.mesh.material.map = this.texture || null; this.mesh.material.needsUpdate = true; this.mesh.visible = !!image;
  }
  layout(extent: number, height: number, x: number, y: number) { this.mesh.scale.set(extent * 2, extent * 2, 1); this.mesh.position.set(x, y, height - .2); this.repeat = extent / 200; this.texture?.repeat.set(this.repeat, this.repeat); }
  destroy() { this.texture?.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
