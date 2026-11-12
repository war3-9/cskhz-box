import { useEffect, useState } from 'react';
import { useLayoutStore } from '../state/layout';
import { validateArrayName } from '../document/arrayName';
import { useArrayNameEdit } from './arrayNameEdit';

export function ArrayNameField({ onMessage }: { onMessage: (message: string) => void }) {
  const name = useLayoutStore(state => state.arrayName);
  const setName = useLayoutStore(state => state.setArrayName);
  const [draft, setDraft] = useState(name), [error, setError] = useState('');
  const setValid = useArrayNameEdit(state => state.setValid);
  useEffect(() => { setDraft(name); setError(''); setValid(true); }, [name, setValid]);
  useEffect(() => () => setValid(true), [setValid]);
  const commit = () => {
    const next = draft.trim();
    try { setName(next); setDraft(next); setError(''); setValid(true); }
    catch (failure) { const message = String(failure); setError(message); setValid(false); onMessage(message); }
  };
  return <label className="array-name-field">T 数组名<input aria-label="T 数组名" value={draft} maxLength={99}
    aria-invalid={Boolean(error)} title={error || '整个布局共用一个全局 Frame 数组'} onChange={event => {
      const value = event.target.value; setDraft(value); setError('');
      try { validateArrayName(value.trim()); setValid(true); } catch { setValid(false); }
    }}
    onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setDraft(name); setError(''); setValid(true); } }} />
    {error && <span className="array-name-error" role="alert">{error.replace(/^Error: /, '')}</span>}
  </label>;
}
