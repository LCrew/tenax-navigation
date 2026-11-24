import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { TileSchema, type Group, type Tile as TileT } from '../../../shared/schema';
import { api, newId } from '../api';
import { Tile } from '../components/Tile';
import { IconPicker } from './IconPicker';
import { Card, ColorField, Field, Modal } from './Modal';

type Props = {
  tile: TileT | null;
  groupId: string;
  groups: Group[];
  /** the page's accent colour, shown as the default highlight */
  accent: string;
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

function EmbedStatus({ embeddable }: { embeddable?: boolean }) {
  if (embeddable === undefined) return <span className="status status--idle">Not checked yet</span>;
  return embeddable ? <span className="status status--ok">Opens inside the page</span> : <span className="status status--bad">Opens in a new tab</span>;
}

export function TileEditor({ tile, groupId, groups, accent, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<TileT>(tile ?? blank());
  const [targetGroup, setTargetGroup] = useState(groupId);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ busy: boolean; reason?: string }>({ busy: false });

  const set = <K extends keyof TileT>(k: K, v: TileT[K]) => setDraft((d) => ({ ...d, [k]: v }));
  // One highlight colour per tile. Older configs may still hold the old sweep/fill colours; setting or
  // resetting the highlight replaces them.
  const highlight = draft.colors?.bar1 ?? draft.colors?.fill ?? draft.colors?.bar3;
  const setHighlight = (v?: string) => setDraft((d) => ({ ...d, colors: v ? { bar1: v } : undefined }));

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
      setProbe({ busy: false, reason: p.reason });
    } catch (e) {
      setProbe({ busy: false, reason: e instanceof Error ? e.message : String(e) });
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
      <div className="stack">
        <div className="editor__preview">
          <span className="label">Preview · hover it</span>
          <Tile tile={{ ...draft, title: draft.title || 'Title' }} disabled />
        </div>

        <Card label="Link">
          <Field label="Title">
            <input className="input" value={draft.title} maxLength={80} autoFocus onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Description" hint="Shown when the tile is hovered.">
            <input className="input" value={draft.description} maxLength={200} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Address (URL)">
            <input
              className="input input--mono"
              value={draft.url}
              inputMode="url"
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value, embeddable: undefined }))}
            />
          </Field>
          <div className="row row--2">
            <Field label="Open as">
              <select className="input" value={draft.openMode} onChange={(e) => set('openMode', e.target.value as TileT['openMode'])}>
                <option value="auto">Auto (inside the page if the site allows it)</option>
                <option value="iframe">Always inside the page</option>
                <option value="newTab">Always in a new tab</option>
              </select>
            </Field>
            <Field label="Section">
              <select className="input" value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name || '(unnamed section)'}
                    {g.adminOnly ? ' · admins only' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="probe">
            <button type="button" className="btn btn--sm" onClick={runProbe} disabled={probe.busy}>
              {probe.busy && <LoaderCircle size={15} className="spin-icon" />} Check if it can open inside
            </button>
            <EmbedStatus embeddable={draft.embeddable} />
            {probe.reason && <span className="field__hint">{probe.reason}</span>}
          </div>
        </Card>

        <Card label="Icon">
          <IconPicker value={draft.icon} onChange={(i) => set('icon', i)} />
        </Card>

        <Card label="Highlight colour (optional)">
          <ColorField label="Highlight" value={highlight} placeholder={accent} onChange={setHighlight} />
          <span className="field__hint">Colours the edge and tint of the pane that slides in when you hover this tile. Leave it empty to follow the theme.</span>
        </Card>
      </div>
    </Modal>
  );
}
