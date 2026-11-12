import { isTauri, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { download } from "../shared/download";

export async function selectOutputDirectory() {
  if (!isTauri()) return "浏览器下载目录";
  return (
    (await open({
      directory: true,
      multiple: false,
      title: "批量导出保存地址",
    })) ?? ""
  );
}
export async function selectNamesFile(): Promise<{
  name: string;
  text: string;
} | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "素材名称文本", extensions: ["txt"] }],
  });
  if (!path) return null;
  return {
    name: path.split(/[\\/]/).at(-1)!,
    text: await invoke<string>("read_text", { path }),
  };
}
export async function writeBatchImage(
  directory: string,
  filename: string,
  blob: Blob,
  subdirectory?: string,
) {
  if (!isTauri()) {
    download(blob, filename);
    return filename;
  }
  return invoke<string>("write_batch_image", {
    directory,
    filename,
    bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    ...(subdirectory !== undefined ? { subdirectory } : {}),
  });
}
