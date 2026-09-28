import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { ConfigSchema, type Config } from '../../../shared/schema';
import { api } from '../api';
import { ColorField, Field, Modal } from './Modal';

type Props = { config: Config; onChange: (c: Config) => void; onClose: () => void };

export function SettingsPanel({ config, onChange, onClose }: Props) {
  const site = config.site;
  const [err, setErr] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const setSite = (patch: Partial<Config['site']>) => onChange({ ...config, site: { ...site, ...patch } });
  const setTheme = (patch: Partial<Config['site']['theme']>) => setSite({ theme: { ...site.theme, ...patch } });
  const setBar = (i: number, v?: string) => {
    if (!v || !/^#[0-9a-fA-F]{6}$/.test(v)) return;
    const bars = [...site.theme.barColors] as Config['site']['theme']['barColors'];
    bars[i] = v;
    setTheme({ barColors: bars });
  };
  const hex = (v?: string) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'navigation-config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const parsed = ConfigSchema.safeParse(JSON.parse(await f.text()));
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid config');
      onChange(parsed.data);
      setErr(null);
    } catch (e: any) {
      setErr(`Import failed: ${e.message}`);
    }
  };

  const uploadLogo = async (f?: File) => {
    if (!f) return;
    try {
      setSite({ logoUrl: (await api.upload(f)).path });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <Modal title="Page settings" onClose={onClose} footer={<button className="btn btn--primary" onClick={onClose}>Done</button>}>
      <div className="settings">
        <Field label="Page title">
          <input className="input" value={site.title} maxLength={80} onChange={(e) => setSite({ title: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field__label">Logo</span>
          <div className="row row--center">
            {site.logoUrl && <img src={site.logoUrl} alt="" height={36} />}
            <button className="btn btn--sm" onClick={() => logoRef.current?.click()}>
              <Upload size={14} /> Upload logo
            </button>
            {site.logoUrl && (
              <button className="btn btn--ghost btn--sm" onClick={() => setSite({ logoUrl: undefined })}>
                Remove
              </button>
            )}
            <input ref={logoRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => uploadLogo(e.target.files?.[0])} />
          </div>
        </div>
        <div className="row">
          <Field label="Color mode">
            <select className="input" value={site.mode} onChange={(e) => setSite({ mode: e.target.value as Config['site']['mode'] })}>
              <option value="auto">Follow system</option>
              <option value="dark">Dark (theme colors)</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <Field label="Columns (max)">
            <select className="input" value={site.columns} onChange={(e) => setSite({ columns: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
        <h3>Theme</h3>
        <div className="row row--2">
          <ColorField label="Background" value={site.theme.bg} onChange={(v) => hex(v) && setTheme({ bg: v })} />
          <ColorField label="Tile surface" value={site.theme.surface} onChange={(v) => hex(v) && setTheme({ surface: v })} />
          <ColorField label="Text" value={site.theme.text} onChange={(v) => hex(v) && setTheme({ text: v })} />
          <ColorField label="Accent" value={site.theme.accent} onChange={(v) => hex(v) && setTheme({ accent: v })} />
        </div>
        <h3>Hover bars</h3>
        <div className="row row--3">
          <ColorField label="Sweep bar 1" value={site.theme.barColors[0]} onChange={(v) => setBar(0, v)} />
          <ColorField label="Sweep bar 2" value={site.theme.barColors[1]} onChange={(v) => setBar(1, v)} />
          <ColorField label="Panel fill" value={site.theme.barColors[2]} onChange={(v) => setBar(2, v)} />
        </div>
        <h3>Backup</h3>
        <div className="row row--center">
          <button className="btn btn--sm" onClick={exportJson}>
            <Download size={14} /> Export JSON
          </button>
          <button className="btn btn--sm" onClick={() => importRef.current?.click()}>
            <Upload size={14} /> Import JSON
          </button>
          <input ref={importRef} type="file" hidden accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
        {err && <p className="error">{err}</p>}
        <p className="field__hint">Changes preview live. Click “Save” in the top bar to publish them.</p>
      </div>
    </Modal>
  );
}
