import { FloatingPanel } from '../dialogs/FloatingPanel';
import { ColorDialog } from '../dialogs/ColorDialog';
import { applyPaletteDraft } from './model';
import { commitPaletteDraft, discardPaletteDraft, updatePaletteDraft, useBrowserPalette } from './bridge';
import { useObjectPreferences } from '../settings/store';
export function BrowserPalette() {
  const { target, error } = useBrowserPalette(); if (!target) return null;
  const setError = (error: string) => useBrowserPalette.setState({ error });
  const close = () => { try { commitPaletteDraft(); discardPaletteDraft(); } catch (error) { setError(String(error)); } };
  return <FloatingPanel title="单元格文字调色" close={close} className="ot-palette-shell" storageKey="box-object-palette-position-v1"><ColorDialog key={target.token} value={target.raw} title={target.title} change={value => updatePaletteDraft({ target, value })} save={value => { try { const next = applyPaletteDraft({ target, value }); updatePaletteDraft({ target: next, value }); useBrowserPalette.setState({ target: next }); setError(''); if (useObjectPreferences.getState().closePaletteOnSave) discardPaletteDraft(); } catch (error) { setError(String(error)); } }} />{error && <p className="ot-dialog-hint" role="alert">{error}<button className="ot-button" onClick={() => { discardPaletteDraft(); setError(''); }}>放弃草稿并关闭</button></p>}</FloatingPanel>;
}
