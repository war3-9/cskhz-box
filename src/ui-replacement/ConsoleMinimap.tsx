import { Image as CanvasImage, Rect } from 'react-konva';
import useImage from 'use-image';
import { minimap } from './hoverParts';

export function ConsoleMinimap({ image }: { image: string }) {
  const [texture] = useImage(image);
  return <>
    <Rect name="console-minimap" {...minimap} listening={false} />
    {texture && <CanvasImage name="console-minimap-image" image={texture} x={minimap.x} y={minimap.y}
      width={minimap.width} height={minimap.height} listening={false} />}
  </>;
}
