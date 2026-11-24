import { useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Tile as TileT } from '../../../shared/schema';
import { api } from '../api';
import { TileIcon } from './TileIcon';
import { LEVELS, warningIcon } from './warning';
import './WarningDialog.css';
import './Tile.css';

type Props = {
  tile: TileT;
  onOpen?: (tile: TileT, e: MouseEvent<HTMLAnchorElement>) => void;
  disabled?: boolean; // edit mode: no navigation
  /** position on the page, for the staggered entrance (capped by the caller) */
  index?: number;
};

export function prettyUrl(url: string) {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

export function Tile({ tile, onOpen, disabled, index }: Props) {
  const [revealed, setRevealed] = useState(false);
  // Chrome won't run the hover lift on the GPU while the finished entrance animation is still attached,
  // so drop it once it has played.
  const [entered, setEntered] = useState(false);
  const pointer = useRef<string>('mouse');

  const style: Record<string, string | number> = {};
  // Optional highlight colour for this tile (edge line and tint of the hover pane). Older configs stored
  // the old sweep/fill colours; the first one set is used.
  const c = tile.colors;
  const hl = c?.bar1 ?? c?.fill ?? c?.bar3;
  if (hl) style['--hl'] = hl;
  if (index !== undefined) style['--i'] = index;

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) return e.preventDefault();
    // Touch has no hover: first tap reveals, second tap opens.
    if (pointer.current === 'touch' && !revealed) {
      e.preventDefault();
      setRevealed(true);
      return;
    }
    api.track({ type: 'click', tileId: tile.id });
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let the browser open a new tab
    onOpen?.(tile, e);
  };

  return (
    <a
      className={`tile${tile.title.length > 26 ? ' tile--long' : ''}${revealed ? ' is-revealed' : ''}${entered ? ' is-in' : ''}`}
      // A tile with a warning links to its warning on this page, so even "open in new tab" shows it first.
      href={tile.warning ? `#/open/${encodeURIComponent(tile.id)}` : tile.url}
      target={tile.warning ? undefined : '_blank'}
      rel="noopener noreferrer"
      style={style as CSSProperties}
      onPointerDown={(e) => (pointer.current = e.pointerType)}
      onAnimationEnd={(e) => e.target === e.currentTarget && setEntered(true)}
      onClick={onClick}
      onAuxClick={(e) => !disabled && e.button === 1 && api.track({ type: 'click', tileId: tile.id })}
      onBlur={() => setRevealed(false)}
      aria-label={`${tile.title}${tile.description ? ` – ${tile.description}` : ''}${tile.warning ? ` (${LEVELS[tile.warning.level].label.toLowerCase()} – read before opening)` : ''}`}
      tabIndex={disabled ? -1 : undefined}
    >
      {/* the clip keeps the moving parts inside the rounded tile, while the tile's own hover shadow
          (::after) stays outside it and can be faded with opacity alone */}
      <span className="tile__clip" aria-hidden="true">
        {/* only editors see which tiles carry a warning */}
        {disabled && tile.warning && (
          <span className={`tile__warn lvl--${tile.warning.level}`} title={`${LEVELS[tile.warning.level].label}: read before opening`}>
            <TileIcon icon={warningIcon(tile.warning)} size={15} />
          </span>
        )}
        {/* active: a brighter pane of glass slides in from the right, a glint passes over the tile */}
        <span className="tile__pane" />
        <span className="tile__glint" />
        {/* one icon: centred above the title at rest, glides to the left side when active */}
        <span className="tile__icon-box">
          <TileIcon icon={tile.icon} size={28} />
        </span>
        <span className="tile__label">{tile.title}</span>
        <span className="tile__panel">
          <strong className="tile__title">{tile.title}</strong>
          {tile.description && <span className="tile__desc">{tile.description}</span>}
          <span className="tile__url">{prettyUrl(tile.url)}</span>
        </span>
      </span>
    </a>
  );
}
