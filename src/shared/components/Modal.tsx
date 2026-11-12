import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { useFeatureActive } from '../../app/FeatureActivity';
export function Modal({
  title,
  children,
  close,
  className,
  dismissDisabled = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
  dismissDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const active = useFeatureActive();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (active && !dialog.open) dialog.showModal();
    if (!active && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [active]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${className ?? ""}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!dismissDisabled) close();
      }}
      closedby="closerequest"
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label="关闭" disabled={dismissDisabled} onClick={close}>
          <X size={18} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
