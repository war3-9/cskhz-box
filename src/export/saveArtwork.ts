import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { download } from "../shared/download";
import { cleanFilename, extension, type BatchFormat } from "./batchConfig";
import { writeBatchImage } from './batchIO';
import { outputFolderName } from './outputFolder';

export function artworkPath(path: string, format: BatchFormat) {
  const suffix = extension(format);
  const basename = path.split(/[\\/]/).pop() ?? "";
  if (!basename || !basename.replace(/[. ]+$/g, ""))
    throw new Error("请选择完整的文件保存路径。");
  const accepted = format === "jpeg" ? ["jpg", "jpeg"] : [suffix];
  if (accepted.some((ext) => basename.toLowerCase().endsWith(`.${ext}`)))
    return path;
  return `${path.replace(/[. ]+$/g, "")}.${suffix}`;
}

export async function saveArtwork(
  blob: Blob,
  name: string,
  format: BatchFormat,
  output?: { directory: string; subdirectory: string },
) {
  const suffix = extension(format);
  const filename = `${cleanFilename(name)}.${suffix}`;
  if (output) {
    const subdirectory = outputFolderName(output.subdirectory);
    await writeBatchImage(output.directory, filename, blob, subdirectory);
    return true;
  }
  if (!isTauri()) {
    download(blob, filename);
    return true;
  }
  const selected = await save({
    defaultPath: filename,
    filters: [{ name: suffix.toUpperCase(), extensions: [suffix] }],
  });
  if (!selected) return false;
  await invoke("write_file", {
    path: artworkPath(selected, format),
    bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
  });
  return true;
}
