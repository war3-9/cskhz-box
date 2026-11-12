export interface CaptureFrame { x: number; y: number; width: number; height: number }

export const defaultCaptureFrame: CaptureFrame = { x: .15, y: .05, width: .7, height: .9 };

export function clampCaptureFrame(frame: CaptureFrame): CaptureFrame {
  const width = Math.max(.2, Math.min(1, frame.width));
  const height = Math.max(.2, Math.min(1, frame.height));
  return {
    x: Math.max(0, Math.min(1 - width, frame.x)),
    y: Math.max(0, Math.min(1 - height, frame.y)),
    width,
    height,
  };
}

export function dragResizeCaptureFrame(frame: CaptureFrame, dx: number, dy: number): CaptureFrame {
  return { ...frame, width: Math.max(.2, Math.min(1 - frame.x, frame.width + dx)), height: Math.max(.2, Math.min(1 - frame.y, frame.height + dy)) };
}

export function resizeCaptureFrame(frame: CaptureFrame, width: number, height: number): CaptureFrame {
  const next = clampCaptureFrame({ ...frame, width, height });
  return clampCaptureFrame({ ...next, x: frame.x + (frame.width - next.width) / 2, y: frame.y + (frame.height - next.height) / 2 });
}

export function captureCanvasRegion(canvas: HTMLCanvasElement, frame: CaptureFrame): Promise<Blob> {
  const output = document.createElement('canvas');
  const region = clampCaptureFrame(frame);
  output.width = Math.max(1, Math.round(canvas.width * region.width));
  output.height = Math.max(1, Math.round(canvas.height * region.height));
  const context = output.getContext('2d');
  if (!context) return Promise.reject(new Error('无法创建 PNG 画布'));
  context.drawImage(canvas, Math.round(canvas.width * region.x), Math.round(canvas.height * region.y), output.width, output.height, 0, 0, output.width, output.height);
  return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败')), 'image/png'));
}
