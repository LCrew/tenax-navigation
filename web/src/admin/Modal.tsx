import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

let openSheets = 0;

/**
 * A bottom sheet (glass design): slides up from the bottom, frosted, 28 px top corners.
 * Rendered into <body> so it never sits inside a transformed or blurred parent.
 * Closes on Esc, on the shade and on the × button.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const html = document.documentElement;
    const prevFocus = document.activeElement as HTMLElement | null;
    openSheets++;
    html.classList.add('sheet-open');
    // move focus into the sheet unless a field inside already took it (autoFocus)
    if (!sheet.current?.contains(document.activeElement)) sheet.current?.focus({ preventScroll: true });
    return () => {
      if (--openSheets === 0) html.classList.remove('sheet-open');
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <>
      <div className="sheet-shade" onMouseDown={onClose} aria-hidden="true" />
      <div ref={sheet} className={`sheet${wide ? ' sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="sheet__head">
          <h2>{title}</h2>
          <button className="rb dk rb--sm" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer && <footer className="sheet__foot">{footer}</footer>}
      </div>
    </>,
    document.body,
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/** A group of fields on a card, with a small uppercase label (like an iOS settings list). */
export function Card({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="card">
      {label && <span className="label">{label}</span>}
      <div className="stack">{children}</div>
    </section>
  );
}

export function ColorField({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (v?: string) => void; placeholder?: string }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="color-field">
        <input type="color" value={value ?? placeholder ?? '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} />
        <input
          className="input input--mono"
          value={value ?? ''}
          placeholder={placeholder ? `${placeholder} (default)` : '#rrggbb'}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={label}
        />
        {value && placeholder && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(undefined)}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
