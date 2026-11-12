import { Line, Group } from 'react-konva';
import { canvasSize } from './native';
import type { ConsoleContour } from './useConsoleContour';
import { consoleGlow } from './hoverParts';

// The first opaque pixel in each column defines the exterior upper contour.
export function ConsoleEdge({ contour, visible }: { contour: ConsoleContour | null; visible: boolean }) {
  if (!contour) return null;
  const { points } = contour;
  return <Group name="console-edge-glow" visible={visible} listening={false} clipFunc={ctx => {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(canvasSize.width, 0);
    for (let i = points.length - 2; i >= 0; i -= 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
  }}><Line points={points} stroke={consoleGlow} strokeWidth={2.5} shadowColor={consoleGlow}
    shadowBlur={18} shadowOpacity={1} listening={false} perfectDrawEnabled={false} /></Group>;
}
