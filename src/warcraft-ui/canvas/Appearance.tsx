import { useEffect, useState } from 'react';
import { Image as CanvasImage, Rect, Text, Line, Circle } from 'react-konva';
import type { UiNode } from '../document/model';
import backgroundUrl from './assets/human-options-menu-background.png';
import { designBackground } from './designBackground';

const menuTexture = 'UI\\Widgets\\EscMenu\\Human\\human-options-menu-background.blp';
function useImage(url?: string) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    setImage(undefined);
    if (!url) return;
    const asset = new window.Image();
    asset.onload = () => setImage(asset);
    asset.src = url;
    return () => { asset.onload = null; };
  }, [url]);
  return image;
}

export function Appearance({ node }: { node: UiNode }) {
  const image = useImage(node.imageData ?? (node.texture?.toLowerCase() === menuTexture.toLowerCase() ? backgroundUrl : undefined));
  const w = node.width, h = node.height, inset = Math.min(10, w / 4, h / 4);
  const textProps = { width: node.width, height: node.height, text: node.text ?? '', fontSize: node.fontSize ?? 54,
    fill: node.textColor ?? node.color, fontFamily: 'serif' };
  const background = !image && <Rect name="design-background" width={w} height={h} {...designBackground(node)} />;
  // These outlines identify component types in the editor. They do not assign
  // textures or change exported Frame properties.
  if (node.kind === 'text') return <>{background}<Text {...textProps} />
    <Line name="type-text" points={[0, h, w, h]} stroke="#be9cd8" strokeWidth={2} dash={[3, 8]} /></>;
  if (node.kind === 'button') {
    return <>{background}{image && <CanvasImage image={image} width={w} height={h} />}
      <Text {...textProps} align="center" verticalAlign="middle" /></>;
  }
  const panel = node.kind === 'panel' || node.kind === 'backdrop';
  return <>
    {background}
    {image && <CanvasImage image={image} width={w} height={h} />}
    {panel ? <><Rect name="type-panel" width={w} height={h} stroke="#7d9dca" strokeWidth={2} />
      {[ [0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1] ].map(([x, y, dx, dy], index) =>
        <Line key={index} points={[x, y + dy * inset * 3, x, y, x + dx * inset * 3, y]} stroke="#a9c4e8" strokeWidth={5} />)}</> :
      <><Rect name="type-picture" width={w} height={h} stroke="#81b9aa" strokeWidth={2} dash={[14, 10]} />
        {!image && <><Line points={[w * .22, h * .68, w * .42, h * .38, w * .56, h * .58, w * .66, h * .48, w * .8, h * .68]}
          stroke="#81b9aa" strokeWidth={3} /><Circle x={w * .68} y={h * .28} radius={Math.min(w, h) * .07} stroke="#81b9aa" strokeWidth={3} /></>}</>}
    {!image && node.texture && <Text width={w} height={Math.min(36, h)} y={Math.max(0, h - 36)} fontSize={Math.min(24, h)} fill="#acb6c2" text="贴图未加载" align="center" />}
  </>;
}
