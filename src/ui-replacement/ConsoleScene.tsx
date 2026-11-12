import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { Group, Image as CanvasImage, Rect, Text } from 'react-konva';
import useImage from 'use-image';
import { hudTexts, nativeLayers, type NativeLayer } from './native';
import type { ConsoleLayer } from './store';
import { ConsoleEdge } from './ConsoleEdge';
import { hoverParts } from './hoverParts';
import { useConsoleContour } from './useConsoleContour';
import { consoleAlphaThreshold } from './consoleContour';
import { ConsoleTooltip } from './ConsoleTooltip';
import { ConsoleMinimap } from './ConsoleMinimap';
import { canReplacePart } from './replacePart';
import { defaultConsoleFont, fontLayerId, isFontTarget } from './fontTypes';

function ConsolePiece({ item, native, onHover, onReplace, onReset }: {
  item: ConsoleLayer; native: NativeLayer; onHover: (id: string | null) => void;
  onReplace: () => void;
  onReset: () => void;
}) {
  const [image] = useImage(item.image);
  const group = useRef<Konva.Group>(null);
  useEffect(() => {
    const nodes = group.current?.find<Konva.Image>('Image').filter(node => node.listening()) ?? [];
    // Ignore transparent holes when hit testing the lower console textures.
    for (const node of nodes) { node.cache({ pixelRatio: 1 }); node.drawHitFromCache(consoleAlphaThreshold); }
    group.current?.getLayer()?.batchDraw();
    return () => { for (const node of nodes) node.clearCache(); };
  }, [image]);
  if (!image) return null;
  return <Group ref={group} name="console-piece" id={item.id} x={native.x} y={native.y}>
    {native.regions.map((region, index) => <CanvasImage key={index} image={image} name="console-native-image"
      x={region.x} y={region.y} width={region.width} height={region.height}
      crop={{ x: region.u * image.width, y: region.v * image.height,
        width: region.uw * image.width, height: region.vh * image.height }}
      listening={native.id.startsWith('HumanUITile0') && region.y > 0}
      onMouseEnter={() => onHover('console')} onMouseLeave={() => onHover(null)}
      onMouseMove={() => onHover('console')}
      onClick={event => { if (event.evt.button === 0) onReplace(); }} onTap={onReplace}
      onContextMenu={event => { event.evt.preventDefault(); event.cancelBubble = true; onReset(); }}
      perfectDrawEnabled={false} />)}
  </Group>;
}

export function ConsoleScene({ layers, side, active, onReplace, onReset }: {
  layers: ConsoleLayer[]; side: string; active: boolean; onReplace: (id: string) => void; onReset: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const contour = useConsoleContour(layers);
  const fontFamily = layers.find(layer => layer.id === fontLayerId)?.image || defaultConsoleFont;
  useEffect(() => { if (!active) setHovered(null); }, [active]);
  return <Group id={`${side}-native-console`} name="console-whole" onMouseLeave={() => setHovered(null)}>
    {contour && <CanvasImage name="console-black-backing" image={contour.backing} listening={false} />}
    {nativeLayers.map(native => <ConsolePiece key={native.id} item={layers.find(item => item.id === native.id)!}
      native={native} onHover={setHovered} onReplace={() => onReplace('console')} onReset={() => onReset('console')} />)}
    <ConsoleMinimap image={layers.find(item => item.id === 'minimap')?.image ?? ''} />
    {hudTexts.map(item => <Text key={item.id} {...item} name="console-hud-text"
      fontFamily={fontFamily} fontSize={18} fill="#ffffff" align={item.text === '0' ? 'right' : 'center'}
      verticalAlign="middle" listening={false} shadowColor="#000000" shadowBlur={2} shadowOffsetY={1} />)}
    {['human-healthbar-fill', 'human-manabar-fill'].map(id => {
      const bar = nativeLayers.find(layer => layer.id === id)!;
      return <Text key={id} x={bar.x} y={bar.y} width={bar.width} height={bar.height}
        text="100 / 100" name="console-vital-text" fill="#fff" fontSize={15}
        align="center" verticalAlign="middle" fontFamily={fontFamily} listening={false}
        shadowColor="#000" shadowBlur={2} />;
    })}
    <ConsoleEdge contour={contour} visible={active && hovered === 'console'} />
    {hoverParts.map(part => <Group key={part.id} name="console-hover-part" id={`hover-${part.id}`}
      x={part.x} y={part.y} onMouseEnter={() => setHovered(part.id)} onMouseLeave={() => setHovered(null)}
      onMouseMove={() => setHovered(part.id)}
      onContextMenu={event => {
        event.evt.preventDefault(); event.cancelBubble = true;
        if (canReplacePart(part.id) || isFontTarget(part.id)) onReset(part.id);
      }}
      onClick={event => {
        event.cancelBubble = true;
        if (event.evt.button === 0 && (canReplacePart(part.id) || isFontTarget(part.id))) onReplace(part.id);
      }} onTap={event => { event.cancelBubble = true; if (canReplacePart(part.id) || isFontTarget(part.id)) onReplace(part.id); }}>
      <Rect width={part.width} height={part.height} fill="rgba(0,0,0,0)" name="console-hit" />
      <Rect width={part.width} height={part.height} name="console-part-glow" listening={false}
        visible={active && hovered === part.id} stroke={part.color} strokeWidth={2}
        shadowColor={part.color} shadowBlur={16} shadowOpacity={1} />
    </Group>)}
    <ConsoleTooltip hovered={active ? hovered : null} contour={contour} />
  </Group>;
}
