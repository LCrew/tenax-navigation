import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { ConfigSchema, type Config } from '../../../shared/schema';
import { api } from '../api';
import { THEMES } from '../theme';
import { Card, Field, Modal } from './Modal';

type Props = { config: Config; onChange: (c: Config) => void; onClose: () => void };

export function SettingsPanel({ config, onChange, onClose }: Props) {
  const site = config.site;
  const [err, setErr] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const setSite = (patch: Partial<Config['site']>) => onChange({ ...config, site: { ...site, ...patch } });

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
    } catch (e) {
      setErr(`Import failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const uploadLogo = async (f?: File) => {
    if (!f) return;
    try {
      setSite({ logoUrl: (await api.upload(f)).path });
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  return (
    <Modal
      title="Page settings"
      onClose={onClose}
      footer={
        <>
          {err && <p className="error">{err}</p>}
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="stack">
        <Card label="Page">
          <Field label="Title">
            <input className="input" value={site.title} maxLength={80} onChange={(e) => setSite({ title: e.target.value })} />
          </Field>
          <div className="field">
            <span className="field__label">Main logo (top left)</span>
            <div className="row--center">
              {site.logoUrl && (
                <span className="logo-plate">
                  <img src={site.logoUrl} alt="Current logo" />
                </span>
              )}
              <button className="btn btn--sm" onClick={() => logoRef.current?.click()}>
                <Upload size={15} /> {site.logoUrl ? 'Replace' : 'Upload logo'}
              </button>
              {site.logoUrl && (
                <button className="btn btn--ghost btn--sm" onClick={() => setSite({ logoUrl: undefined })}>
                  Remove
                </button>
              )}
              <input ref={logoRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </div>
            <span className="field__hint">Each section can have its own company logo too: use the “Logo” button next to the section name.</span>
          </div>
        </Card>

        <Card label="Look">
          <div className="field">
            <span className="field__label">Default theme</span>
            <div className="seg" role="group" aria-label="Default theme">
              {THEMES.map((t) => (
                <button key={t.id} className={site.mode === t.id ? 'on' : ''} aria-pressed={site.mode === t.id} onClick={() => setSite({ mode: t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
            <span className="field__hint">“Auto” follows each device’s light/dark setting. People can still pick their own theme in the profile menu.</span>
          </div>
          <div className="field">
            <span className="field__label">Tiles per row (at most)</span>
            <div className="seg" role="group" aria-label="Tiles per row">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} className={site.columns === n ? 'on' : ''} aria-pressed={site.columns === n} onClick={() => setSite({ columns: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card label="Backup">
          <div className="row--center">
            <button className="btn btn--sm" onClick={exportJson}>
              <Download size={15} /> Export JSON
            </button>
            <button className="btn btn--sm" onClick={() => importRef.current?.click()}>
              <Upload size={15} /> Import JSON
            </button>
            <input ref={importRef} type="file" hidden accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} />
          </div>
        </Card>

        <p className="field__hint">Changes preview live. Click “Save” in the top bar to publish them.</p>
      </div>
    </Modal>
  );
}
