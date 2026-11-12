import { Children, Fragment, isValidElement, useRef, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ThemeSelect, type SelectOption } from './ThemeSelect';

function optionsFrom(children: ReactNode, inheritedDisabled = false): SelectOption[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>(child)) return [];
    if (child.type === Fragment || child.type === 'optgroup') return optionsFrom(child.props.children, inheritedDisabled || child.props.disabled);
    if (child.type !== 'option') return [];
    const text = Children.toArray(child.props.children).join('');
    return [{ value: String(child.props.value ?? text), label: child.props.label ?? text, text, disabled: inheritedDisabled || child.props.disabled }];
  });
}
/** Retains existing form handlers while user interaction uses the themed listbox. */
export function StyledSelect({ children, onChange, value, defaultValue, disabled, className, id, title, style, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const native = useRef<HTMLSelectElement>(null), options = optionsFrom(children);
  return <span className="styled-select" style={style}>
    <select {...props} ref={native} hidden aria-hidden="true" tabIndex={-1} value={value} defaultValue={defaultValue} disabled={disabled} onChange={onChange}>{children}</select>
    <ThemeSelect id={id} className={className} label={props['aria-label'] || title || '选择'} title={title} disabled={disabled} value={String(value ?? defaultValue ?? options[0]?.value ?? '')} options={options} onChange={next => {
      const target = native.current!; target.value = next;
      onChange?.({ target, currentTarget: target, type: 'change', nativeEvent: new Event('change'), preventDefault() {}, stopPropagation() {}, persist() {}, isDefaultPrevented: () => false, isPropagationStopped: () => false } as ChangeEvent<HTMLSelectElement>);
    }} />
  </span>;
}
