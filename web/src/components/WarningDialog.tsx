import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Tile, Warning } from '../../../shared/schema';
import { prettyUrl } from './Tile';
import { TileIcon } from './TileIcon';
import { DEFAULT_CONFIRM, LEVELS, warningIcon } from './warning';
import './WarningDialog.css';

type Props = {
  tile: Pick<Tile, 'title' | 'url' | 'icon'>;
  warning: Warning;
  onAccept: () => void;
  onCancel: () => void;
  /** editor preview: same dialog, the button only closes it */
  preview?: boolean;
};

/**
 * Stands between a tile and its page: a dialog window (GLASS-DESIGN 6.10) with the level's coloured
 * band on top, a scrolling middle and a fixed button row. The open button unlocks only once the
 * text has been scrolled through, the box is ticked and the optional wait is over.
 */
export function WarningDialog({ tile, warning, onAccept, onCancel, preview }: Props) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const msg = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const [more, setMore] = useState(false); // the middle has more below: fade its lower edge
  const [left, setLeft] = useState(warning.waitSeconds);
  const level = LEVELS[warning.level];

  // countdown (runs while people read)
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  // read = the end of the text has been in view; text that fits counts as read straight away
  const checkRead = () => {
    const el = body.current;
    const m = msg.current?.getBoundingClientRect();
    if (!el || !m) return;
    if (m.bottom <= el.getBoundingClientRect().bottom + 2) setReadAll(true);
    setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  };
  useLayoutEffect(checkRead, [warning.message]);
  useEffect(() => {
    window.addEventListener('resize', checkRead);
    return () => window.removeEventListener('resize', checkRead);
  }, []);

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
    const f = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])];
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
  // always exactly one line, so ticking the box never changes the window's size
  const status = !readAll
    ? 'Scroll to the end of the text first'
    : !checked
      ? 'Tick the box to continue'
      : left > 0
        ? `The page unlocks in ${left} s`
        : 'Ready to open';

  return createPortal(
    <>
      <div className="warn-shade" onMouseDown={onCancel} aria-hidden="true" />
      <div className="warn-wrap" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
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
              <TileIcon icon={warningIcon(warning)} size={26} />
            </span>
            <span className="warn__level">{level.label}</span>
          </div>

          <div ref={body} className={`warn__body${more ? ' has-more' : ''}`} onScroll={checkRead}>
            <h2 className="warn__title" id={`${ids}-t`}>
              {warning.title || `${level.label}: read before opening`}
            </h2>

            <div className="warn__site">
              <span className="warn__site-icon" aria-hidden="true">
                <TileIcon icon={tile.icon} size={22} />
              </span>
              <span className="warn__site-text">
                <span className="warn__site-name">{tile.title}</span>
                <span className="warn__site-url">{prettyUrl(tile.url)}</span>
              </span>
            </div>

            <div ref={msg} className="card warn__msg" id={`${ids}-m`}>
              {warning.message}
            </div>

            <label className={`card warn__check${readAll ? '' : ' is-locked'}`}>
              <input
                className="visually-hidden"
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                disabled={!readAll}
                aria-describedby={`${ids}-s`}
              />
              <span className="warn__box" aria-hidden="true" />
              <span className="warn__check-text">
                <span className="warn__check-label">{warning.confirmText || DEFAULT_CONFIRM}</span>
                <span className={`warn__status${ready ? ' is-ready' : ''}`} id={`${ids}-s`} aria-live="polite">
                  {status}
                </span>
              </span>
            </label>
          </div>

          <div className="warn__actions">
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn--primary" disabled={!ready} onClick={onAccept}>
              {preview ? 'Close preview' : 'Open page'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
