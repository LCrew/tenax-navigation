import { useId, useRef, useState, type ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { WARNING_LEVELS, type Tile, type Warning } from '../../../shared/schema';
import { TileIcon } from '../components/TileIcon';
import { WarningDialog } from '../components/WarningDialog';
import { DEFAULT_CONFIRM, LEVELS, WARNING_ICONS } from '../components/warning';
import { IconPicker } from './IconPicker';
import { Field } from './Modal';

const WAITS = [0, 3, 5, 10, 15, 30];

/** Like Field, but for a set of buttons: a <label> would pass clicks on its empty space to the first button. */
function ButtonField({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field" role="group" aria-labelledby={id}>
      <span className="field__label" id={id}>
        {label}
      </span>
      {children}
    </div>
  );
}

const starter = (): Warning => ({ level: 'warning', message: '', waitSeconds: 0 });

type Props = {
  tile: Pick<Tile, 'title' | 'url'>;
  value?: Warning;
  onChange: (w?: Warning) => void;
};

/** Tile editor section: an optional warning people must read and accept before the page opens. */
export function WarningEditor({ tile, value, onChange }: Props) {
  const last = useRef<Warning | undefined>(value); // switching it off and on again keeps what was written
  const [preview, setPreview] = useState(false);
  const [moreIcons, setMoreIcons] = useState(false);

  const on = !!value;
  const w = value ?? last.current ?? starter();
  const set = <K extends keyof Warning>(k: K, v: Warning[K]) => {
    const next = { ...w, [k]: v };
    last.current = next;
    onChange(next);
  };
  const toggle = (enable: boolean) => {
    if (!enable) last.current = value ?? last.current;
    onChange(enable ? w : undefined);
  };
  const iconName = w.icon?.type === 'lucide' ? w.icon.value : null;

  return (
    <>
      <div className="seg" role="group" aria-label="Warning before opening">
        {[false, true].map((v) => (
          <button key={String(v)} type="button" className={on === v ? 'on' : ''} aria-pressed={on === v} onClick={() => toggle(v)}>
            {v ? 'Warn before opening' : 'No warning'}
          </button>
        ))}
      </div>
      {!on && <span className="field__hint">People must read a warning and tick a box before this page opens, for risky admin tools or systems with real consequences.</span>}

      {on && (
        <>
          <ButtonField label="Level">
            <div className="seg warn-levels">
              {WARNING_LEVELS.map((l) => (
                <button key={l} type="button" className={`lvl--${l}${w.level === l ? ' on' : ''}`} aria-pressed={w.level === l} onClick={() => set('level', l)}>
                  <span className="warn-levels__dot" aria-hidden="true" />
                  {LEVELS[l].label}
                </button>
              ))}
            </div>
          </ButtonField>

          <Field label="Heading (optional)">
            <input
              className="input"
              value={w.title ?? ''}
              maxLength={80}
              placeholder={`${LEVELS[w.level].label}: read before opening`}
              onChange={(e) => set('title', e.target.value || undefined)}
            />
          </Field>

          <Field label="Warning text" hint="What people must know before they continue. Line breaks are kept.">
            <textarea
              className="input"
              value={w.message}
              maxLength={2000}
              rows={5}
              placeholder="e.g. This is the live production database. Changes apply immediately and cannot be undone."
              onChange={(e) => set('message', e.target.value)}
            />
          </Field>

          <ButtonField label="Icon">
            <div className="warn-icons">
              <button
                type="button"
                className={`icon-picker__item warn-icons__default${!w.icon ? ' is-selected' : ''}`}
                aria-pressed={!w.icon}
                title="The level's own icon"
                onClick={() => set('icon', undefined)}
              >
                <TileIcon icon={{ type: 'lucide', value: LEVELS[w.level].icon }} size={20} />
                <span>Auto</span>
              </button>
              {WARNING_ICONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  title={n}
                  aria-label={n}
                  aria-pressed={iconName === n}
                  className={`icon-picker__item${iconName === n ? ' is-selected' : ''}`}
                  onClick={() => set('icon', { type: 'lucide', value: n })}
                >
                  <TileIcon icon={{ type: 'lucide', value: n }} size={22} />
                </button>
              ))}
            </div>
            <button type="button" className="btn btn--sm btn--ghost warn-icons__more" onClick={() => setMoreIcons((v) => !v)} aria-expanded={moreIcons}>
              {moreIcons ? 'Hide other icons' : 'Other icon or upload…'}
            </button>
            {moreIcons && <IconPicker value={w.icon ?? { type: 'lucide', value: LEVELS[w.level].icon }} onChange={(i) => set('icon', i)} />}
          </ButtonField>

          <div className="row row--2">
            <Field label="Checkbox text (optional)">
              <input
                className="input"
                value={w.confirmText ?? ''}
                maxLength={120}
                placeholder={DEFAULT_CONFIRM}
                onChange={(e) => set('confirmText', e.target.value || undefined)}
              />
            </Field>
            <Field label="Open button unlocks after">
              <select className="input" value={w.waitSeconds} onChange={(e) => set('waitSeconds', Number(e.target.value))}>
                {WAITS.map((s) => (
                  <option key={s} value={s}>
                    {s ? `${s} seconds` : 'No wait'}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <button type="button" className="btn btn--sm" onClick={() => setPreview(true)} disabled={!w.message.trim()}>
              <Eye size={16} /> Preview warning
            </button>
          </div>

          {preview && (
            <WarningDialog
              tile={{ title: tile.title || 'Title', url: tile.url }}
              warning={w}
              preview
              onAccept={() => setPreview(false)}
              onCancel={() => setPreview(false)}
            />
          )}
        </>
      )}
    </>
  );
}
