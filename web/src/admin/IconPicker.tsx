import { useMemo, useRef, useState } from 'react';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import { Upload } from 'lucide-react';
import type { Icon } from '../../../shared/schema';
import { api } from '../api';

export function IconPicker({ value, onChange }: { value: Icon; onChange: (i: Icon) => void }) {
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '-');
    return (s ? iconNames.filter((n) => n.includes(s)) : iconNames).slice(0, 60);
  }, [q]);

  const upload = async (f?: File) => {
    if (!f) return;
    setErr(null);
    try {
      const { path } = await api.upload(f);
      onChange({ type: 'upload', value: path });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="icon-picker">
      <div className="icon-picker__row">
        <input className="input" placeholder="Search icons… (e.g. mail, chart, server)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Upload
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {err && <p className="error">{err}</p>}
      {value.type === 'upload' && (
        <div className="icon-picker__current">
          <img src={value.value} alt="" width={40} height={40} /> Custom image in use
        </div>
      )}
      <div className="icon-picker__grid">
        {matches.map((n) => (
          <button
            key={n}
            type="button"
            title={n}
            className={`icon-picker__item${value.type === 'lucide' && value.value === n ? ' is-selected' : ''}`}
            onClick={() => onChange({ type: 'lucide', value: n })}
          >
            <DynamicIcon name={n as IconName} size={22} />
          </button>
        ))}
      </div>
    </div>
  );
}
