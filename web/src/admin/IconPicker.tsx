import { useMemo, useRef, useState } from 'react';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import { LoaderCircle, Search, Upload, X } from 'lucide-react';
import type { Icon } from '../../../shared/schema';
import { api } from '../api';
import { ICON_SETS } from './iconSets';

const ALL = new Set<string>(iconNames);
const SETS = ICON_SETS.map((s) => ({ ...s, icons: s.icons.filter((n) => ALL.has(n)) }));
const PAGE = 96;

function Item({ name, selected, onPick }: { name: string; selected: boolean; onPick: (n: string) => void }) {
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={selected}
      className={`icon-picker__item${selected ? ' is-selected' : ''}`}
      onClick={() => onPick(name)}
    >
      <DynamicIcon name={name as IconName} size={22} strokeWidth={1.75} />
    </button>
  );
}

export function IconPicker({ value, onChange }: { value: Icon; onChange: (i: Icon) => void }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const term = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return null;
    const slug = term.replace(/\s+/g, '-');
    // whole ready-made sets whose topic matches ("money", "hr", "warehouse"), then every icon whose name matches
    const fromSets = SETS.filter((s) => s.label.toLowerCase().includes(term) || s.words.split(' ').some((w) => w.startsWith(term))).flatMap(
      (s) => s.icons,
    );
    const byName = iconNames.filter((n) => n.includes(slug));
    const starts = byName.filter((n) => n.startsWith(slug));
    return [...new Set([...fromSets, ...starts, ...byName])];
  }, [term]);

  const selected = value.type === 'lucide' ? value.value : null;
  const pick = (n: string) => onChange({ type: 'lucide', value: n });

  const upload = async (f?: File) => {
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const { path } = await api.upload(f);
      onChange({ type: 'upload', value: path });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="icon-picker">
      <div className="icon-picker__row">
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input
            placeholder="Search icons – mail, truck, chart, money…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            aria-label="Search icons"
          />
          {q && (
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setQ('')} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </label>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy} title="Use your own image (PNG, JPG, WebP or SVG)">
          {busy ? <LoaderCircle size={17} className="spin-icon" /> : <Upload size={17} />} Upload
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {err && <p className="error">{err}</p>}
      <div className="icon-picker__current">
        <span className="icon-picker__item is-selected" aria-hidden="true">
          {value.type === 'upload' ? (
            <img src={value.value} alt="" width={24} height={24} style={{ objectFit: 'contain' }} />
          ) : (
            <DynamicIcon name={value.value as IconName} size={22} strokeWidth={1.75} />
          )}
        </span>
        <span>{value.type === 'upload' ? 'Your own image' : value.value}</span>
      </div>

      <div className="icon-picker__scroll">
        {results === null ? (
          SETS.map((s) => (
            <div key={s.label} className="icon-picker__cat">
              <span className="label">{s.label}</span>
              <div className="icon-picker__grid">
                {s.icons.map((n) => (
                  <Item key={n} name={n} selected={selected === n} onPick={pick} />
                ))}
              </div>
            </div>
          ))
        ) : results.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No icon matches “{q.trim()}”. Try a simpler word, or upload your own image.
          </p>
        ) : (
          <>
            <div className="icon-picker__grid">
              {results.slice(0, limit).map((n) => (
                <Item key={n} name={n} selected={selected === n} onPick={pick} />
              ))}
            </div>
            {results.length > limit && (
              <button type="button" className="btn btn--sm icon-picker__more" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Show more ({results.length - limit})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
