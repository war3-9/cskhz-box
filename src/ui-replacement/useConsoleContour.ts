import { useEffect, useState } from 'react';
import { canvasSize, nativeLayers } from './native';
import type { ConsoleLayer } from './store';
import { traceConsoleContour } from './consoleContour';

export interface ConsoleContour { points: number[]; backing: HTMLCanvasElement }

// Both black fill and edge glow use the same composited, cropped lower textures.
export function useConsoleContour(layers: ConsoleLayer[]): ConsoleContour | null {
  const mainLayers = layers.filter(item => /^HumanUITile0[1-4]$/.test(item.id));
  const key = JSON.stringify(mainLayers.map(item => [item.id, item.image]));
  const [result, setResult] = useState<{ key: string; contour: ConsoleContour } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const sources: [string, string][] = JSON.parse(key);
    void Promise.all(sources.map(([id, src]) => new Promise<{ id: string; image: HTMLImageElement }>((resolve, reject) => {
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.onload = () => resolve({ id, image }); image.onerror = reject; image.src = src;
    }))).then(images => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize.width; canvas.height = canvasSize.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      for (const { id, image } of images) {
        const layer = nativeLayers.find(item => item.id === id)!;
        for (const region of layer.regions.filter(region => region.y > 0)) {
          ctx.drawImage(image, region.u * image.width, region.v * image.height, region.uw * image.width,
            region.vh * image.height, layer.x + region.x, layer.y + region.y, region.width, region.height);
        }
      }
      const { points, backing } = traceConsoleContour(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      ctx.putImageData(new ImageData(backing, canvas.width, canvas.height), 0, 0);
      setResult({ key, contour: { points, backing: canvas } });
    }).catch(() => { /* Do not reuse a different console's mask after a failed image load. */ });
    return () => { cancelled = true; };
  }, [key]);
  return result?.key === key ? result.contour : null;
}
