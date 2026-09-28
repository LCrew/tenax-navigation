import { useState } from 'react';
import { TileSchema, type Group, type Tile as TileT } from '../../../shared/schema';
import { api, newId } from '../api';
import { Tile } from '../components/Tile';
import { IconPicker } from './IconPicker';
import { ColorField, Field, Modal } from './Modal';

type Props = {
  tile: TileT | null;
  groupId: string;
  groups: Group[];
  barColors: [string, string, string];
  onSave: (groupId: string, tile: TileT) => void;
  onClose: () => void;
};

const blank = (): TileT => ({
  id: newId(),
  title: '',
  description: '',
  url: 'https://',
  icon: { type: 'lucide', value: 'globe' },
  openMode: 'auto',
});

export function TileEditor({ tile, groupId, groups, barColors, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<TileT>(tile ?? blank());
  const [targetGroup, setTargetGroup] = useState(groupId);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ busy: boolean; reason?: string }>({ busy: false });

  const set = <K extends keyof TileT>(k: K, v: TileT[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setColor = (k: 'bar1' | 'bar2' | 'fill', v?: string) =>
    setDraft((d) => {
      const colors = { ...d.colors, [k]: v };
      if (!v) delete colors[k];
      return { ...d, colors: Object.keys(colors).length ? colors : undefined };
    });

  const save = async () => {
    const parsed = TileSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.') || 'tile'}: ${i.message}`).join(' · '));
      return;
    }
    let result = parsed.data;
    if (!tile || tile.url !== result.url || result.embeddable === undefined) {
      setProbe({ busy: true });
      try {
        const p = await api.probe(result.url);
        result = { ...result, embeddable: p.embeddable ?? undefined };
      } catch {
        /* probe is best-effort */
      }
    }
    onSave(targetGroup, result);
  };

  const runProbe = async () => {
    setProbe({ busy: true });
    try {
      const p = await api.probe(draft.url);
      set('embeddable', p.embeddable ?? undefined);
      const verdict = p.embeddable === null ? '? Unknown' : p.embeddable ? '✓ Can be embedded' : '✕ Cannot be embedded';
      setProbe({ busy: false, reason: `${verdict} — ${p.reason}` });
    } catch (e: any) {
      setProbe({ busy: false, reason: e.message });
    }
  };

  return (
    <Modal
      title={tile ? `Edit “${tile.title}”` : 'New tile'}
      onClose={onClose}
      footer={
        <>
          {error && <p className="error">{error}</p>}
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={probe.busy}>
            {probe.busy ? 'Checking…' : tile ? 'Apply' : 'Add tile'}
          </button>
        </>
      }
    >
      <div className="editor">
        <div className="editor__preview">
          <span className="field__label">Preview (hover it)</span>
          <Tile tile={{ ...draft, title: draft.title || 'Title' }} disabled />
        </div>
        <div className="editor__form">
          <Field label="Title">
            <input className="input" value={draft.title} maxLength={80} autoFocus onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Description">
            <input className="input" value={draft.description} maxLength={200} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="URL">
            <input
              className="input input--mono"
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value, embeddable: undefined }))}
            />
          </Field>
          <div className="row">
            <Field label="Open as">
              <select className="input" value={draft.openMode} onChange={(e) => set('openMode', e.target.value as TileT['openMode'])}>
                <option value="auto">Auto (inside page if the site allows it)</option>
                <option value="iframe">Always inside page</option>
                <option value="newTab">Always new tab</option>
              </select>
            </Field>
            <Field label="Section">
              <select className="input" value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name || '(unnamed section)'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="probe">
            <button type="button" className="btn btn--sm" onClick={runProbe} disabled={probe.busy}>
              Check if embeddable
            </button>
            <span className="field__hint">
              {probe.reason ?? (draft.embeddable === undefined ? 'Not checked yet' : draft.embeddable ? '✓ Can be embedded' : '✕ Opens in new tab')}
            </span>
          </div>
          <div className="row row--3">
            <ColorField label="Sweep bar 1" value={draft.colors?.bar1} placeholder={barColors[0]} onChange={(v) => setColor('bar1', v)} />
            <ColorField label="Sweep bar 2" value={draft.colors?.bar2} placeholder={barColors[1]} onChange={(v) => setColor('bar2', v)} />
            <ColorField label="Panel fill" value={draft.colors?.fill} placeholder={barColors[2]} onChange={(v) => setColor('fill', v)} />
          </div>
        </div>
        <Field label="Icon">
          <IconPicker value={draft.icon} onChange={(i) => set('icon', i)} />
        </Field>
      </div>
    </Modal>
  );
}
