import { useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { Tile as TileT } from '../../../shared/schema';
import { api } from '../api';
import { readableOn } from '../theme';
import { TileIcon } from './TileIcon';
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
  const pointer = useRef<string>('mouse');

  const style: Record<string, string | number> = {};
  const c = tile.colors;
  if (c?.bar1) style['--bar1'] = c.bar1;
  if (c?.bar2) style['--bar2'] = c.bar2;
  const fill = c?.fill ?? c?.bar3;
  if (fill) {
    style['--bar3'] = fill;
    style['--on-fill'] = readableOn(fill);
  }
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
      className={`tile${tile.title.length > 26 ? ' tile--long' : ''}${revealed ? ' is-revealed' : ''}`}
      href={tile.url}
      target="_blank"
      rel="noopener noreferrer"
      style={style as CSSProperties}
      onPointerDown={(e) => (pointer.current = e.pointerType)}
      onClick={onClick}
      onAuxClick={(e) => !disabled && e.button === 1 && api.track({ type: 'click', tileId: tile.id })}
      onBlur={() => setRevealed(false)}
      aria-label={`${tile.title}${tile.description ? ` – ${tile.description}` : ''}`}
      tabIndex={disabled ? -1 : undefined}
    >
      <span className="tile__bars" aria-hidden="true">
        <span className="tile__bar tile__bar--1" />
        <span className="tile__bar tile__bar--2" />
        <span className="tile__bar tile__bar--3" />
      </span>
      {/* at rest: icon with the full title under it */}
      <span className="tile__rest" aria-hidden="true">
        <span className="tile__icon-box">
          <TileIcon icon={tile.icon} size={28} />
        </span>
        <span className="tile__label">{tile.title}</span>
      </span>
      {/* active: icon on the left, details on the filled right side */}
      <span className="tile__side" aria-hidden="true">
        <span className="tile__icon-box tile__icon-box--lg">
          <TileIcon icon={tile.icon} size={32} />
        </span>
      </span>
      <span className="tile__panel" aria-hidden="true">
        <strong className="tile__title">{tile.title}</strong>
        {tile.description && <span className="tile__desc">{tile.description}</span>}
        <span className="tile__url">{prettyUrl(tile.url)}</span>
      </span>
    </a>
  );
}
