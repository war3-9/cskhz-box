import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleHelp } from "lucide-react";
import "./batch-help.css";

export function BatchHelp({
  label,
  children,
  maxWidth = 280,
}: {
  label: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      const dialog = button.current?.closest("dialog")?.getBoundingClientRect();
      if (!anchor || !dialog) return;
      const width = Math.min(maxWidth, dialog.width - 32);
      const left = Math.max(
        dialog.left + 16,
        Math.min(anchor.right - width, dialog.right - width - 16),
      );
      const height = tooltip.current?.getBoundingClientRect().height ?? 100;
      const top =
        anchor.bottom + height + 8 < window.innerHeight - 12
          ? anchor.bottom + 8
          : Math.max(12, anchor.top - height - 8);
      setPosition({ left, top, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, maxWidth]);
  return (
    <span
      className="batch-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(button.current === document.activeElement)}
    >
      <button
        ref={button}
        type="button"
        aria-label={`${label}说明`}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      <span
        ref={tooltip}
        id={id}
        role="tooltip"
        hidden={!open}
        style={position}
      >
        {children}
      </span>
    </span>
  );
}

export function BatchField({
  label,
  id,
  help,
  children,
}: {
  label: string;
  id: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="batch-field">
      <div className="batch-label">
        <label htmlFor={id}>{label}</label>
        <BatchHelp label={label}>{help}</BatchHelp>
      </div>
      {children}
    </div>
  );
}
