import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './themeSelect.css';

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean; text?: string };
export function ThemeSelect({ label, value, options, disabled, onChange, id: suppliedId, className = '', title }: {
  label: string; value: string; options: readonly SelectOption[]; disabled?: boolean; onChange: (value: string) => void;
  id?: string; className?: string; title?: string;
}) {
  const generated = useId(), id = suppliedId || generated, root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 300 });
  const selected = options.findIndex(option => option.value === value);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const choose = (index: number) => { if (!options[index] || options[index].disabled) return; onChange(options[index].value); setOpen(false); trigger.current?.focus(); };
  const show = () => { setActive(enabled.includes(selected) ? selected : enabled[0] ?? 0); setOpen(true); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current!.getBoundingClientRect(), available = window.innerHeight - box.bottom - 12;
      const below = available >= Math.min(220, options.length * 38 + 12) || box.top < available;
      const maxHeight = Math.max(50, Math.min(320, below ? available : box.top - 12));
      const width = Math.min(Math.max(box.width, 150), window.innerWidth - 16);
      setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)), top: below ? box.bottom + 5 : Math.max(8, box.top - Math.min(maxHeight, options.length * 38 + 12) - 5), width, maxHeight });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, options.length]);
  useEffect(() => { if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <div className={`theme-select ${className}`} ref={root}>
    <button ref={trigger} id={id} type="button" role="combobox" aria-label={label} title={title} aria-expanded={open} aria-haspopup="listbox"
      aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled || !enabled.length}
      onClick={() => open ? setOpen(false) : show()} onBlur={() => setOpen(false)}
      onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
        if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'Enter' || event.key === ' ') { if (open) choose(active); else show(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { if (!open) show(); else setActive(enabled[(enabled.indexOf(active) + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]); }
        if (event.key === 'Home' || event.key === 'End') { setActive(event.key === 'Home' ? enabled[0] : enabled.at(-1)!); setOpen(true); }
        if (event.key.length === 1 && event.key !== ' ') {
          const match = options.findIndex(option => !option.disabled && (option.text ?? (typeof option.label === 'string' ? option.label : '')).toLowerCase().startsWith(event.key.toLowerCase()));
          if (match >= 0) { setActive(match); setOpen(true); }
        }
      }}><span>{options[selected]?.label ?? '请选择'}</span><ChevronDown size={16} /></button>
    {open && createPortal(<div ref={list} id={`${id}-list`} className="theme-select-options" role="listbox" aria-label={label} style={{ ...position, position: 'fixed' }}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} data-index={index} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        className={active === index ? 'is-active' : ''} onPointerDown={event => event.preventDefault()} onMouseMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === value && <Check size={16} />}
      </div>)}
    </div>, trigger.current?.closest('dialog') ?? document.body)}
  </div>;
}
