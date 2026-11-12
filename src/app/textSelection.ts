import './textSelection.css';

// Cancel browser-wide selection without stopping application shortcuts.
window.addEventListener('keydown', event => {
  if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)
    || event.key.toLowerCase() !== 'a') return;
  const target = event.composedPath().find(node => node instanceof HTMLElement);
  if (target instanceof HTMLElement
    && (target.matches('input, textarea, select') || target.isContentEditable)) return;
  event.preventDefault();
});
