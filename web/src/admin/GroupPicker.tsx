import { useEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, Plus, Search, ShieldAlert, UsersRound, X } from 'lucide-react';
import { MAX_TILE_GROUPS, type SecurityGroupRef } from '../../../shared/schema';
import { api, type SecurityGroup } from '../api';
import './GroupPicker.css';

type Props = {
  value: SecurityGroupRef[];
  onChange: (v: SecurityGroupRef[]) => void;
};

/** Copies a group's object ID, and says so for a moment. */
function CopyId({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard blocked: the ID is on screen and can be selected */
    }
  };
  return (
    <button type="button" className={`icon-btn icon-btn--sm gpick__copy${done ? ' is-done' : ''}`} onClick={copy} title={done ? 'Copied' : 'Copy object ID'} aria-label={done ? 'Copied' : `Copy object ID ${id}`}>
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

/** Find Entra ID security groups by name or object ID, and pick the ones that may see a tile. */
export function GroupPicker({ value, onChange }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SecurityGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const latest = useRef(value);
  latest.current = value;

  // search as you type (debounced); an empty search lists the first groups alphabetically
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(
      () => {
        setBusy(true);
        api
          .securityGroups(q, ctrl.signal)
          .then((r) => {
            setResults(r.groups);
            setError(null);
          })
          .catch((e) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : String(e)))
          .finally(() => !ctrl.signal.aborted && setBusy(false));
      },
      q ? 300 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // groups renamed in Entra ID since they were picked get their new name; deleted ones are pointed out
  useEffect(() => {
    if (!value.length) return;
    let live = true;
    api
      .lookUpGroups(value.map((g) => g.id))
      .then((r) => {
        if (!live) return;
        setMissing(r.missing);
        const names = new Map(r.groups.map((g) => [g.id, g.name]));
        const cur = latest.current;
        if (cur.some((g) => names.has(g.id) && names.get(g.id) !== g.name)) {
          onChange(cur.map((g) => ({ ...g, name: names.get(g.id) ?? g.name })));
        }
      })
      .catch(() => {}); // the search shows any Graph problem
    return () => {
      live = false;
    };
  }, []); // once, when the editor opens

  const picked = new Set(value.map((g) => g.id));
  const full = value.length >= MAX_TILE_GROUPS;
  const toggle = (g: SecurityGroup) =>
    onChange(picked.has(g.id) ? value.filter((v) => v.id !== g.id) : full ? value : [...value, { id: g.id, name: g.name }]);

  return (
    <div className="gpick">
      {value.length > 0 ? (
        <ul className="gpick__picked" aria-label="Groups that see this tile">
          {value.map((g) => {
            const gone = missing.includes(g.id);
            return (
              <li key={g.id} className={`gpick__chip${gone ? ' is-gone' : ''}`}>
                <span className="gpick__chip-icon" aria-hidden="true">
                  {gone ? <ShieldAlert size={16} /> : <UsersRound size={16} />}
                </span>
                <span className="gpick__chip-text">
                  <span className="gpick__name">{g.name}</span>
                  <code className="gpick__id">{g.id}</code>
                  {gone && <span className="gpick__gone">Not found in Entra ID – deleted, or no longer a security group</span>}
                </span>
                <CopyId id={g.id} />
                <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => onChange(value.filter((v) => v.id !== g.id))} title="Remove" aria-label={`Remove ${g.name}`}>
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="gpick__none">No groups picked yet. Pick at least one below.</p>
      )}

      <div className="search">
        <Search size={17} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search security groups by name, or paste an object ID"
          aria-label="Search security groups"
          spellCheck={false}
        />
        {busy && <LoaderCircle size={17} className="spin-icon" />}
        {q && !busy && (
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => setQ('')} title="Clear search" aria-label="Clear search">
            <X size={15} />
          </button>
        )}
      </div>

      {error ? (
        <p className="error gpick__error">{error}</p>
      ) : (
        results && (
          <ul className="gpick__results" aria-label="Security groups" aria-busy={busy}>
            {results.length === 0 && <li className="gpick__empty">{q ? `No security group matches “${q}”.` : 'No security groups found.'}</li>}
            {results.map((g) => {
              const on = picked.has(g.id);
              return (
                <li key={g.id} className={`gpick__row${on ? ' is-on' : ''}`}>
                  <button type="button" className="gpick__pick" onClick={() => toggle(g)} disabled={!on && full} aria-pressed={on}>
                    <span className="gpick__mark" aria-hidden="true">
                      {on ? <Check size={15} /> : <Plus size={15} />}
                    </span>
                    <span className="gpick__row-text">
                      <span className="gpick__name">{g.name}</span>
                      {g.description && <span className="gpick__desc">{g.description}</span>}
                      <code className="gpick__id">{g.id}</code>
                    </span>
                  </button>
                  <CopyId id={g.id} />
                </li>
              );
            })}
          </ul>
        )
      )}
      {full && <span className="field__hint">That's the most a tile can have ({MAX_TILE_GROUPS}). Remove one to add another.</span>}
    </div>
  );
}
