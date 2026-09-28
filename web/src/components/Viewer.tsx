import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, RotateCw } from 'lucide-react';
import type { Tile } from '../../../shared/schema';
import { TileIcon } from './TileIcon';
import { prettyUrl } from './Tile';

export function Viewer({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [tile.id, reloadKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="viewer" role="dialog" aria-label={tile.title}>
      <div className="viewer__bar">
        <button className="btn btn--ghost" onClick={onClose} title="Back (Esc)">
          <ArrowLeft size={18} /> Back
        </button>
        <span className="viewer__title">
          <TileIcon icon={tile.icon} size={20} />
          <strong>{tile.title}</strong>
          <span className="viewer__url">{prettyUrl(tile.url)}</span>
        </span>
        <span className="viewer__hint">Blank page? The site may block embedding →</span>
        <button className="btn btn--ghost" onClick={() => setReloadKey((k) => k + 1)} title="Reload">
          <RotateCw size={18} />
        </button>
        <a className="btn btn--primary" href={tile.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={18} /> New tab
        </a>
      </div>
      <div className="viewer__body">
        {!loaded && (
          <div className="viewer__status">
            {slow ? (
              <>
                <p>This site is taking long or can’t be shown inside the page.</p>
                <a className="btn btn--primary" href={tile.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={18} /> Open in new tab
                </a>
              </>
            ) : (
              <span className="spinner" aria-label="Loading" />
            )}
          </div>
        )}
        <iframe
          key={reloadKey}
          src={tile.url}
          title={tile.title}
          onLoad={() => setLoaded(true)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          allow="clipboard-read; clipboard-write; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
}
