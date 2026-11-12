import { openFiles } from './providers';
import { useViewer } from '../workspace/store';
export function FileInputs() {
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => { void openFiles([...event.currentTarget.files || []]).catch(error => useViewer.getState().patch({ error: String(error) })); event.currentTarget.value = ''; };
  return <><input id="viewer-folder" hidden type="file" multiple {...({ webkitdirectory: '' } as Record<string, string>)} onChange={onChange} /><input id="viewer-files" hidden type="file" multiple accept=".mdx,.mdl,.blp,.tga,.dds,.png,.jpg,.jpeg,.mp3,.wav,.ogg,.flac,.m4a,.aac" onChange={onChange} /></>;
}
