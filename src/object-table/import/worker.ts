import { importExcel } from './read';
self.onmessage = async (event: MessageEvent<Blob>) => {
  try { const project = await importExcel(event.data, (message, fraction) => self.postMessage({ message, fraction })); self.postMessage({ project }); }
  catch (error) { self.postMessage({ error: String(error) }); }
};
