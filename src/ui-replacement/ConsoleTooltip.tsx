import { Group, Rect, Text } from 'react-konva';
import { canvasSize } from './native';
import { hoverParts, replacementHints } from './hoverParts';
import type { ConsoleContour } from './useConsoleContour';
import { isFontTarget } from './fontTypes';

export function ConsoleTooltip({ hovered, contour }: { hovered: string | null; contour: ConsoleContour | null }) {
  const text = hovered ? replacementHints[hovered] : undefined;
  const part = hovered === 'console' && contour
    ? { x: 0, y: Math.min(...contour.points.filter((_, index) => index % 2 === 1)), width: canvasSize.width, height: 0 }
    : hoverParts.find(item => item.id === hovered);
  if (!text || !part) return null;
  const font = isFontTarget(hovered!);
  const height = font ? 112 : 86;
  const width = Math.max(text.length * 18, 6 * 16) + 24;
  const x = Math.max(8, Math.min(part.x + part.width / 2 - width / 2, canvasSize.width - width - 8));
  const y = Math.max(8, Math.min(canvasSize.height - height - 8, part.y < 98 ? part.y + part.height + 12 : part.y - height - 12));
  return <Group name="console-replacement-tooltip" x={x} y={y} listening={false}>
    <Rect width={width} height={height} fill="#17212bf2" stroke="#718296" strokeWidth={1}
      cornerRadius={5} shadowColor="#000" shadowBlur={8} shadowOpacity={0.3} />
    <Text text={text} width={width} height={32} y={3} fontSize={18} fill="#fff"
      fontFamily="Microsoft YaHei, sans-serif" align="center" verticalAlign="middle" />
    <Text text="左键点击替换" name="console-tooltip-action" width={width} height={24} y={34} fontSize={16} fill="#c2cfdd"
      fontFamily="Microsoft YaHei, sans-serif" align="center" verticalAlign="middle" />
    <Text text="右键点击重置" name="console-tooltip-reset" width={width} height={24} y={58} fontSize={16} fill="#c2cfdd"
      fontFamily="Microsoft YaHei, sans-serif" align="center" verticalAlign="middle" />
    {font && <Text text="全地图原生界面共用" name="console-tooltip-font-scope" width={width} height={24} y={82} fontSize={15} fill="#f2ce85"
      fontFamily="Microsoft YaHei, sans-serif" align="center" verticalAlign="middle" />}
  </Group>;
}
