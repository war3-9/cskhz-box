import { useEffect, useRef } from 'react';

export function useDismissMenus(active: boolean) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (target?: EventTarget | null) => {
      root.current?.querySelectorAll<HTMLDetailsElement>('.ot-file-menu[open]').forEach(menu => {
        if (!(target instanceof Node) || !menu.contains(target)) menu.open = false;
      });
    };
    const pointer = (event: PointerEvent) => close(event.target);
    const focus = (event: FocusEvent) => close(event.target);
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const menu = root.current?.querySelector<HTMLDetailsElement>('.ot-file-menu[open]');
      if (!menu) return;
      const restoreFocus = menu.contains(document.activeElement);
      close();
      if (restoreFocus) menu.querySelector('summary')?.focus();
    };
    const blur = () => close();
    if (!active) close();
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', blur);
    };
  }, [active]);
  return root;
}
