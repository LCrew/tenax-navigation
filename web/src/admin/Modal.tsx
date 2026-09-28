import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
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

export function ColorField({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (v?: string) => void; placeholder?: string }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="color-field">
        <input type="color" value={value ?? placeholder ?? '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input
          className="input input--mono"
          value={value ?? ''}
          placeholder={placeholder ? `${placeholder} (theme)` : '#rrggbb'}
          onChange={(e) => onChange(e.target.value || undefined)}
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
