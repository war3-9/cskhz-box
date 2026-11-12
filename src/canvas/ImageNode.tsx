import { useEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Image } from "react-konva";
import useImage from "use-image";
import { useUi } from "../app/uiStore";
import type { ImageLayer } from "../shared/types";
import { retainAlpha, releaseAlpha } from "./alphaHit";
import { useImageTransform } from "./useImageTransform";
import { prepareLayer } from "../layers/styles/render/prepare";
import { previewLayer, useLayerDraft } from "../layers/styles/draftStore";
import { useWorkspaceRecovery } from '../project/recovery';
interface Props {
  layer: ImageLayer;
  register: (id: string, node: Konva.Image | null) => void;
}
export function ImageNode({ layer, register }: Props) {
  useLayerDraft();
  const display = previewLayer(layer);
  const [image, status] = useImage(layer.imagePath, 'anonymous');
  const [draftImage] = useImage(display.imagePath, 'anonymous');
  const prepared = useMemo(
    () => (draftImage ? prepareLayer(draftImage, display) : null),
    [draftImage, display.width, display.height, display.effects],
  );
  const ref = useRef<Konva.Image>(null);
  const transform = useImageTransform(ref, layer);
  useEffect(() => {
    register(layer.id, ref.current);
    return () => register(layer.id, null);
  }, [layer.id, register]);
  useEffect(() => {
    if (status === "failed" && !useWorkspaceRecovery.getState().issues.length)
      useUi.getState().notify(`无法加载图层「${layer.name}」`, "error");
  }, [status, layer.name]);
  useEffect(() => {
    if (!image || status !== "loaded") return;
    try {
      retainAlpha(layer.imagePath, image);
      return () => releaseAlpha(layer.imagePath);
    } catch {
      useUi
        .getState()
        .notify(`无法读取图层「${layer.name}」的透明像素`, "error");
    }
  }, [image, status, layer.imagePath, layer.name]);
  return (
    <Image
      ref={ref}
      id={layer.id}
      image={draftImage ?? image}
      x={layer.x}
      y={layer.y}
      width={display.width}
      height={display.height}
      offsetX={display.width / 2}
      offsetY={display.height / 2}
      rotation={layer.rotation}
      scaleX={layer.flipX ? -1 : 1}
      scaleY={layer.flipY ? -1 : 1}
      opacity={display.opacity}
      globalCompositeOperation={display.blendMode ?? "source-over"}
      sceneFunc={
        status === 'failed'
          ? (context, shape) => {
              context.fillStyle = '#77777733'; context.fillRect(0, 0, shape.width(), shape.height());
              context.strokeStyle = '#d58c45'; context.lineWidth = 1;
              context.strokeRect(0, 0, shape.width(), shape.height());
              context.beginPath(); context.moveTo(0,0); context.lineTo(shape.width(),shape.height());
              context.moveTo(shape.width(),0); context.lineTo(0,shape.height()); context.stroke();
            }
          : prepared
          ? (context, shape) => {
              const sx = shape.width() / display.width,
                sy = shape.height() / display.height;
              context.drawImage(
                prepared.image,
                prepared.x * sx,
                prepared.y * sy,
                prepared.width * sx,
                prepared.height * sy,
              );
            }
          : undefined
      }
      visible={layer.visible}
      listening={false}
      draggable={false}
      {...transform}
    />
  );
}
