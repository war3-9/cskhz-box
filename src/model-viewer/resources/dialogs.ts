import { open, type OpenDialogOptions } from '@tauri-apps/plugin-dialog';
import { useViewer } from '../workspace/store';

let choosing = false;
export async function chooseViewerPath(options: OpenDialogOptions) {
  if (choosing) return null;
  choosing = true;
  const previousStatus = useViewer.getState().status, status = options.title || '请选择资源';
  useViewer.getState().patch({ error: '', status });
  try { return await open({ multiple: false, ...options }); }
  finally { choosing = false; if (useViewer.getState().status === status) useViewer.getState().patch({ status: previousStatus }); }
}
