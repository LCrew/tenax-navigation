import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, LogIn, Search, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { api, type AuditEvent, type AuditFilter, type PersonAck, type PersonRow } from '../api';
import { LEVELS } from '../components/warning';

/*
 * Per-person views for Statistics: everyone who used the page, one person's accepted warnings and
 * activity, and the activity log of everyone. Times are shown in Latvian time, like the daily totals.
 */

const TZ = 'Europe/Riga';
const fmt = new Intl.NumberFormat('en-US');
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });

const dayKey = (t: number) => dayKeyFmt.format(t);
function dayTitle(t: number) {
  const key = dayKey(t);
  if (key === dayKey(Date.now())) return 'Today';
  if (key === dayKey(Date.now() - 86_400_000)) return 'Yesterday';
  return dayFmt.format(t);
}
function ago(t: number) {
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 45 ? `${d} ${d === 1 ? 'day' : 'days'} ago` : dateTimeFmt.format(t).split(',')[0];
}
const initials = (name: string) =>
  name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search audit__search">
      <Search size={17} aria-hidden="true" />
      <input value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => onChange('')} aria-label="Clear search">
          <X size={15} />
        </button>
      )}
    </label>
  );
}

const Avatar = ({ name }: { name: string }) => (
  <span className="audit__avatar" aria-hidden="true">
    {initials(name)}
  </span>
);

const LevelChip = ({ level }: { level: AuditEvent['level'] }) =>
  level ? <span className={`audit__lvl lvl--${level}`}>{LEVELS[level].label}</span> : null;

/* ---------------- activity log ---------------- */

const FILTERS: { id: AuditFilter | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'opened', label: 'Opened' },
  { id: 'warnings', label: 'Warnings' },
  { id: 'visits', label: 'Visits' },
];
const PAGE = 100;

const EVENT_ICON = { visit: LogIn, open: ExternalLink, warned: TriangleAlert, accept: ShieldCheck } as const;

const VERB: Record<AuditEvent['type'], string> = {
  visit: 'visited the page',
  open: 'opened',
  warned: 'was shown the warning for',
  accept: 'accepted the warning and opened',
};

function EventText({ e, withName, onPerson }: { e: AuditEvent; withName: boolean; onPerson?: (oid: string) => void }) {
  const verb = withName ? VERB[e.type] : VERB[e.type][0].toUpperCase() + VERB[e.type].slice(1);
  return (
    <span className="audit__what">
      {withName &&
        (onPerson ? (
          <button type="button" className="audit__name" onClick={() => onPerson(e.oid)} title={e.email}>
            {e.name}
          </button>
        ) : (
          <strong>{e.name}</strong>
        ))}
      {withName && ' '}
      {verb}
      {e.type !== 'visit' && (
        <>
          {' '}
          <strong>{e.title ?? 'a removed tile'}</strong>
        </>
      )}
    </span>
  );
}

export function ActivityLog({ days, oid, onPerson }: { days: number; oid?: string; onPerson?: (oid: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<AuditFilter | 'all'>('all');
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useDebounced(q.trim());

  const params = useMemo(() => ({ days, oid, q: query, type: filter === 'all' ? undefined : filter, limit: PAGE }), [days, oid, query, filter]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api.audit(params).then(
      (r) => live && (setEvents(r.events), setMore(r.more), setLoading(false)),
      (e) => live && (setError(e.message), setLoading(false)),
    );
    return () => {
      live = false;
    };
  }, [params]);

  const older = () => {
    if (!events?.length) return;
    setLoading(true);
    api.audit({ ...params, before: events[events.length - 1].t }).then(
      (r) => (setEvents([...events, ...r.events]), setMore(r.more), setLoading(false)),
      (e) => (setError(e.message), setLoading(false)),
    );
  };

  const byDay = useMemo(() => {
    const out: { key: string; t: number; items: AuditEvent[] }[] = [];
    for (const e of events ?? []) {
      const key = dayKey(e.t);
      if (out.at(-1)?.key !== key) out.push({ key, t: e.t, items: [] });
      out.at(-1)!.items.push(e);
    }
    return out;
  }, [events]);

  return (
    <div className="audit">
      <div className="audit__tools">
        <SearchBox value={q} onChange={setQ} placeholder={oid ? 'Search tools' : 'Search people or tools'} />
        <div className="seg" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'on' : undefined} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!events && !error && <span className="spinner" />}
      {events && !events.length && <p className="audit__empty">{query || filter !== 'all' ? 'Nothing matches.' : 'No activity in this time range.'}</p>}

      {byDay.map((d) => (
        <section key={d.key} className="audit__day">
          <h3 className="audit__day-title">{dayTitle(d.t)}</h3>
          <ul className="audit__list">
            {d.items.map((e, i) => {
              const Icon = EVENT_ICON[e.type];
              return (
                <li key={`${e.t}-${e.oid}-${i}`} className={`audit__row audit__row--${e.type}`}>
                  <time className="audit__time" dateTime={new Date(e.t).toISOString()} title={dateTimeFmt.format(e.t)}>
                    {timeFmt.format(e.t)}
                  </time>
                  <span className={`audit__icon${e.level ? ` lvl--${e.level}` : ''}`} aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  <EventText e={e} withName={!oid} onPerson={onPerson} />
                  <LevelChip level={e.level} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {more && (
        <button type="button" className="btn btn--sm audit__more" onClick={older} disabled={loading}>
          {loading ? 'Loading…' : 'Show older'}
        </button>
      )}
    </div>
  );
}

/* ---------------- people ---------------- */

export function PeopleList({ days, onPick }: { days: number; onPick: (oid: string) => void }) {
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    setError(null);
    api.people(days).then((r) => setPeople(r.people), (e) => setError(e.message));
  }, [days]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (people ?? []).filter((p) => !s || `${p.name} ${p.email ?? ''}`.toLowerCase().includes(s));
  }, [people, q]);

  return (
    <div className="audit">
      <div className="audit__tools">
        <SearchBox value={q} onChange={setQ} placeholder="Search by name or email" />
        {people && (
          <span className="muted audit__count">
            {fmt.format(shown.length)} {shown.length === 1 ? 'person' : 'people'}
          </span>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {!people && !error && <span className="spinner" />}
      {people && !shown.length && <p className="audit__empty">{q ? 'Nobody matches.' : 'Nobody has used the page yet.'}</p>}

      {shown.length > 0 && (
        <table className="ranking people">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="num">Visits</th>
              <th scope="col" className="num">Opened</th>
              <th scope="col" className="num people__opt">Warnings accepted</th>
              <th scope="col" className="num">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.oid} className={p.visits + p.opens ? undefined : 'is-zero'}>
                <td>
                  <button type="button" className="people__who" onClick={() => onPick(p.oid)}>
                    <Avatar name={p.name} />
                    <span className="people__text">
                      <span className="people__name">{p.name}</span>
                      {p.email && <span className="people__email">{p.email}</span>}
                    </span>
                  </button>
                </td>
                <td className="num">{fmt.format(p.visits)}</td>
                <td className="num">{fmt.format(p.opens)}</td>
                <td className="num people__opt">{fmt.format(p.accepts)}</td>
                <td className="num muted" title={dateTimeFmt.format(p.last)}>
                  {ago(p.last)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const ACK_STATE: Record<PersonAck['state'], { label: string; cls: string }> = {
  current: { label: 'Valid', cls: 'status--ok' },
  changed: { label: 'Warning changed since', cls: 'status--bad' },
  removed: { label: 'Warning removed', cls: 'status--idle' },
};

export function PersonView({ oid, days, onBack, backLabel }: { oid: string; days: number; onBack: () => void; backLabel: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.person>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api.person(oid).then(setData, (e) => setError(e.message));
  }, [oid]);

  return (
    <div className="stack">
      <div>
        <button type="button" className="btn btn--sm btn--ghost audit__back" onClick={onBack}>
          <ArrowLeft size={16} /> {backLabel}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <span className="spinner" />}

      {data && (
        <>
          <header className="person">
            <Avatar name={data.person.name} />
            <div className="person__text">
              <h3 className="person__name">{data.person.name}</h3>
              {data.person.email && <span className="muted">{data.person.email}</span>}
              <span className="person__seen muted">
                First seen {dateTimeFmt.format(data.person.first)} · last seen {ago(data.person.last)}
              </span>
            </div>
          </header>

          <section className="card stats__card">
            <span className="label">Accepted warnings</span>
            {!data.acks.length ? (
              <p className="field__hint">Hasn’t accepted any warning yet.</p>
            ) : (
              <ul className="audit__list acks">
                {data.acks.map((a) => (
                  <li key={a.tileId} className="audit__row">
                    <span className={`audit__icon lvl--${a.level}`} aria-hidden="true">
                      <ShieldCheck size={15} />
                    </span>
                    <span className="audit__what">
                      <strong>{a.title}</strong>
                      <span className="muted acks__when">
                        last accepted {dateTimeFmt.format(a.at)}
                        {a.state === 'current' && !a.acknowledge && ' · this warning is shown every time'}
                      </span>
                    </span>
                    <LevelChip level={a.level} />
                    <span className={`status ${ACK_STATE[a.state].cls}`}>{ACK_STATE[a.state].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card stats__card">
            <span className="label">Activity</span>
            <ActivityLog days={days} oid={oid} />
          </section>
        </>
      )}
    </div>
  );
}
