import { useEffect, useRef } from 'react';
import { updateObjectPreferences, useObjectPreferences } from '../settings/store';

export function useEditorHeights() {
  const preview = useRef<HTMLDivElement>(null), source = useRef<HTMLTextAreaElement>(null);
  const previewHeight = useObjectPreferences(s => s.previewHeight), sourceHeight = useObjectPreferences(s => s.sourceHeight);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resizing: HTMLElement | null = null;
    const persist = () => {
      if (!resizing) return;
      const height = Math.round(resizing.getBoundingClientRect().height);
      const current = useObjectPreferences.getState();
      const key = resizing === preview.current ? 'previewHeight' : 'sourceHeight';
      if (height === current[key]) return;
      try { updateObjectPreferences({ [key]: height }); }
      catch (error) { window.dispatchEvent(new CustomEvent('object-preference-error', { detail: String(error) })); }
    };
    // Only a deliberate resize-grip drag changes the preference. Window resizing
    // can temporarily shrink the editors without overwriting their saved heights.
    const start = (event: PointerEvent) => {
      if (event.button !== 0) return;
      for (const element of [preview.current, source.current]) {
        if (!element) continue;
        const box = element.getBoundingClientRect();
        if (event.target === element && event.clientX >= box.right - 18 && event.clientY >= box.bottom - 18) resizing = element;
      }
    };
    const finish = () => { clearTimeout(timer); persist(); resizing = null; };
    const observer = new ResizeObserver(() => { if (resizing) { clearTimeout(timer); timer = setTimeout(persist, 200); } });
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    if (preview.current) observer.observe(preview.current);
    if (source.current) observer.observe(source.current);
    return () => { clearTimeout(timer); resizing = null; observer.disconnect(); window.removeEventListener('pointerdown', start, true); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish); };
  }, []);
  return { preview, source, previewHeight, sourceHeight };
}
