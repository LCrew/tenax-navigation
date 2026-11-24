import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Tile, Warning } from '../../../shared/schema';
import { prettyUrl } from './Tile';
import { TileIcon } from './TileIcon';
import { DEFAULT_CONFIRM, LEVELS, warningIcon } from './warning';
import './WarningDialog.css';

type Props = {
  tile: Pick<Tile, 'title' | 'url'>;
  warning: Warning;
  onAccept: () => void;
  onCancel: () => void;
  /** editor preview: same dialog, the button only closes it */
  preview?: boolean;
};

/**
 * Stands between a tile and its page. The open button unlocks only once the whole text has been
 * scrolled through, the box is ticked and the optional wait is over.
 */
export function WarningDialog({ tile, warning, onAccept, onCancel, preview }: Props) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const msg = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const [left, setLeft] = useState(warning.waitSeconds);
  const level = LEVELS[warning.level];

  // countdown
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  // a message short enough to fit counts as read
  const checkRead = () => {
    const el = msg.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setReadAll(true);
  };
  useLayoutEffect(checkRead, [warning.message]);

  // focus, scroll lock, focus return
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    box.current?.focus();
    return () => {
      root.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation(); // keep Esc from also closing a sheet underneath (editor preview)
    if (e.key === 'Escape') return onCancel();
    if (e.key !== 'Tab') return;
    // keep focus inside the dialog
    const f = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') ?? [])];
    if (!f.length) return;
    const [first, last] = [f[0], f[f.length - 1]];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const ready = checked && readAll && left <= 0;
  const waitingFor = !readAll ? 'Scroll to the end of the text to continue.' : !checked ? 'Tick the box to continue.' : null;

  return createPortal(
    <div className="warn-shade" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={box}
        className={`warn lvl--${warning.level}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-t`}
        aria-describedby={`${ids}-m`}
        tabIndex={-1}
        onKeyDown={onKey}
      >
        <div className="warn__band">
          <span className="warn__badge" aria-hidden="true">
            <TileIcon icon={warningIcon(warning)} size={28} />
          </span>
          <span className="warn__level">{level.label}</span>
        </div>

        <div className="warn__body">
          <h2 className="warn__title" id={`${ids}-t`}>
            {warning.title || `${level.label}: read before opening`}
          </h2>
          <p className="warn__target">
            Opens <strong>{tile.title}</strong> · {prettyUrl(tile.url)}
          </p>
          <div ref={msg} className="warn__msg" id={`${ids}-m`} tabIndex={0} onScroll={checkRead}>
            {warning.message}
          </div>
          <label className="warn__check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={!readAll} />
            <span>{warning.confirmText || DEFAULT_CONFIRM}</span>
          </label>
          {waitingFor && <p className="warn__hint">{waitingFor}</p>}
        </div>

        <div className="warn__foot">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary warn__go" disabled={!ready} onClick={onAccept}>
            {preview ? 'Close preview' : 'Open page'}
            {left > 0 && <span className="warn__count">{left}</span>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
