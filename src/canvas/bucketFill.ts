import { useEditor } from "../layers/store";
import { useBucket } from "./bucketStore";

function colorDataUrl(color: string, width: number, height: number) {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

export function addBucketFill() {
  const { document } = useEditor.getState();
  const color = useBucket.getState().color;
  if (document.canvasCreated === false) return;
  const imagePath = colorDataUrl(color, document.width, document.height);
  if (!imagePath) return;
  useEditor.getState().addFillLayer({
    id: `fill-${crypto.randomUUID()}`,
    name: `填色 · ${color.toUpperCase()}`,
    groupId: "",
    categoryId: "",
    source: "user",
    imagePath,
    thumbnailPath: imagePath,
    width: document.width,
    height: document.height,
  });
}
