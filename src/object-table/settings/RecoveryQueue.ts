export interface SaveTiming { realtime: boolean; intervalSeconds: number }

/** A single writer; edits during IO collapse into the next latest snapshot. */
export class RecoveryQueue {
  private revision = 0;
  private saved = 0;
  private firstPending = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  constructor(private timing: () => SaveTiming, private write: () => Promise<void>, private error: (error: unknown) => void) {}
  get pending() { return this.revision !== this.saved; }
  changed() {
    if (!this.pending) this.firstPending = Date.now();
    this.revision++;
    this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    if (!this.pending) return;
    const timing = this.timing(), max = timing.realtime ? 5000 : timing.intervalSeconds * 1000;
    const remaining = Math.max(0, max - (Date.now() - this.firstPending));
    this.timer = setTimeout(() => { void this.flush().catch(this.error); }, timing.realtime ? Math.min(1000, remaining) : remaining);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    return this.running ??= this.drain().finally(() => { this.running = undefined; });
  }
  private async drain() {
    while (this.pending) {
      const revision = this.revision;
      try { await this.write(); }
      catch (error) {
        this.firstPending = Date.now();
        // Retry at the configured interval; never spin on a failed filesystem write.
        this.timer = setTimeout(() => { void this.flush().catch(this.error); }, this.timing().intervalSeconds * 1000);
        throw error;
      }
      this.saved = revision;
      this.firstPending = Date.now();
    }
  }
}
