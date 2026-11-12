// The caller supplies resource sizes and protects visible entries. Eviction is
// least-recently-used, independent of card mount/unmount and page boundaries.
export class PreviewCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;
  constructor(readonly maxEntries: number, readonly maxBytes: number, private dispose: (value: T) => void) {}
  get(key: string) {
    const entry = this.entries.get(key);
    if (entry) { this.entries.delete(key); this.entries.set(key, entry); }
    return entry?.value;
  }
  set(key: string, value: T, bytes: number) {
    this.delete(key); this.entries.set(key, { value, bytes }); this.bytes += bytes;
  }
  delete(key: string) {
    const entry = this.entries.get(key); if (!entry) return;
    this.entries.delete(key); this.bytes -= entry.bytes; this.dispose(entry.value);
  }
  trim(protectedKeys: Set<string>) {
    for (const [key] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.bytes <= this.maxBytes) break;
      if (!protectedKeys.has(key)) this.delete(key);
    }
  }
  clear() { for (const key of this.entries.keys()) this.delete(key); }
}
