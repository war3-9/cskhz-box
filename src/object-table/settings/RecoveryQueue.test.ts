import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryQueue } from './RecoveryQueue';
afterEach(() => vi.useRealTimers());
describe('物编自动恢复写入队列', () => {
  it('停止输入后合并保存，持续输入最多等待五秒', async () => {
    vi.useFakeTimers(); const write = vi.fn(async () => {}), error = vi.fn();
    const queue = new RecoveryQueue(() => ({ realtime: true, intervalSeconds: 30 }), write, error);
    queue.changed(); await vi.advanceTimersByTimeAsync(700); queue.changed(); await vi.advanceTimersByTimeAsync(999); expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(write).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) { queue.changed(); await vi.advanceTimersByTimeAsync(500); }
    expect(write).toHaveBeenCalledTimes(2); expect(error).not.toHaveBeenCalled();
  });
  it('关闭实时保存时固定间隔，不因连续修改无限延后', async () => {
    vi.useFakeTimers(); const write = vi.fn(async () => {});
    const timing = { realtime: false, intervalSeconds: 10 };
    const queue = new RecoveryQueue(() => timing, write, vi.fn());
    queue.changed(); await vi.advanceTimersByTimeAsync(9000); queue.changed(); await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    queue.changed(); timing.realtime = true; queue.schedule(); await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(2);
  });
  it('慢磁盘只允许一个写入，期间修改合并成最新快照，退出 flush 等待全部完成', async () => {
    vi.useFakeTimers(); let release!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
    const queue = new RecoveryQueue(() => ({ realtime: true, intervalSeconds: 30 }), write, vi.fn());
    queue.changed(); const first = queue.flush(); queue.changed(); queue.changed();
    expect(queue.flush()).toBe(first); expect(write).toHaveBeenCalledTimes(1);
    release(); await first; expect(write).toHaveBeenCalledTimes(2); expect(queue.pending).toBe(false);
    await queue.flush(); expect(write).toHaveBeenCalledTimes(2);
  });
  it('失败保留修改，通知并按间隔重试，手动保存可以立即重试', async () => {
    vi.useFakeTimers(); const write = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined), error = vi.fn();
    const queue = new RecoveryQueue(() => ({ realtime: true, intervalSeconds: 30 }), write, error);
    queue.changed(); await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledTimes(1); expect(queue.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(29000); expect(write).toHaveBeenCalledTimes(1);
    await queue.flush(); expect(write).toHaveBeenCalledTimes(2); expect(queue.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(30000); expect(write).toHaveBeenCalledTimes(2);
  });
});
