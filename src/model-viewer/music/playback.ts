export class MusicPlayback {
  private context = new AudioContext();
  private gain = this.context.createGain();
  private buffer?: AudioBuffer;
  private node?: AudioBufferSourceNode;
  private offset = 0;
  private started = 0;
  private disposed = false;
  loop = false;
  constructor(private changed: () => void) { this.gain.connect(this.context.destination); }
  async load(bytes: ArrayBuffer) {
    const buffer = await this.context.decodeAudioData(bytes);
    if (this.disposed) return;
    this.buffer = buffer; this.changed();
  }
  get duration() { return this.buffer?.duration ?? 0; }
  get playing() { return !!this.node; }
  get time() {
    const value = this.offset + (this.node ? this.context.currentTime - this.started : 0);
    return this.loop && this.duration ? value % this.duration : Math.min(value, this.duration);
  }
  async play() {
    if (!this.buffer || this.disposed || this.node) return;
    await this.context.resume(); if (this.disposed || this.node) return;
    if (this.offset >= this.duration) this.offset = 0;
    const node = this.context.createBufferSource(); node.buffer = this.buffer; node.loop = this.loop;
    node.connect(this.gain); this.node = node; this.started = this.context.currentTime;
    node.onended = () => { if (this.node === node) { this.node = undefined; this.offset = this.duration; node.disconnect(); this.changed(); } };
    node.start(0, this.offset); this.changed();
  }
  pause() {
    this.offset = this.time; const node = this.node; this.node = undefined;
    if (node) { node.onended = null; node.stop(); node.disconnect(); } this.changed();
  }
  async seek(time: number) { const playing = this.playing; this.pause(); this.offset = Math.max(0, Math.min(time, this.duration)); this.changed(); if (playing) await this.play(); }
  volume(value: number) { this.gain.gain.value = Math.max(0, Math.min(1, value)); }
  repeat(value: boolean) { const time = this.time; if (this.node) { this.offset = time; this.started = this.context.currentTime; this.node.loop = value; } this.loop = value; }
  dispose() { this.disposed = true; this.pause(); this.buffer = undefined; this.gain.disconnect(); void this.context.close().catch(() => {}); }
}
