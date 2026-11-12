export function commitObjectEditor() {
  const detail: { error?: string } = {};
  window.dispatchEvent(new CustomEvent('object-table-commit', { detail }));
  if (detail.error) throw new Error(detail.error);
}
