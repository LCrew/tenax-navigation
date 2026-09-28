import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Config, Tile } from '../../../shared/schema';
import { api, type StatsDay } from '../api';
import { TileIcon } from '../components/TileIcon';
import { Modal } from './Modal';
import './StatsPanel.css';

const RANGES = [7, 30, 90, 365] as const;
const fmt = new Intl.NumberFormat('en-US');
const pct = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const dayLabel = (iso: string, long = false) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(long && { weekday: 'short' }), timeZone: 'UTC' });

export function StatsPanel({ config, onClose }: { config: Config; onClose: () => void }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [days, setDays] = useState<StatsDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.stats(range).then((r) => setDays(r.days), (e) => setError(e.message));
  }, [range]);

  const tiles = useMemo(() => config.groups.flatMap((g) => g.tiles), [config]);

  const summary = useMemo(() => {
    if (!days) return null;
    const perTile = new Map<string, number>();
    let views = 0;
    for (const d of days) {
      views += d.views;
      for (const [id, n] of Object.entries(d.clicks)) perTile.set(id, (perTile.get(id) ?? 0) + n);
    }
    const clicks = [...perTile.values()].reduce((a, b) => a + b, 0);
    // Every current tile (even unused ones), plus removed tiles that still have clicks in range.
    const rows: { id: string; tile?: Tile; clicks: number }[] = tiles.map((t) => ({ id: t.id, tile: t, clicks: perTile.get(t.id) ?? 0 }));
    for (const [id, n] of perTile) if (!tiles.some((t) => t.id === id)) rows.push({ id, clicks: n });
    rows.sort((a, b) => b.clicks - a.clicks || (a.tile?.title ?? '').localeCompare(b.tile?.title ?? ''));
    return { views, clicks, rows };
  }, [days, tiles]);

  return (
    <Modal title="Statistics" onClose={onClose} wide>
      <div className="stats">
        <div className="stats__filters" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} className={`seg${r === range ? ' is-active' : ''}`} aria-pressed={r === range} onClick={() => setRange(r)}>
              {r === 365 ? '1 year' : `${r} days`}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        {!summary && !error && <span className="spinner" />}

        {summary && days && (
          <>
            <div className="stats__tiles">
              <StatTile label="Page views" value={fmt.format(summary.views)} />
              <StatTile label="Tool clicks" value={fmt.format(summary.clicks)} />
              <StatTile label="Clicks per view" value={summary.views ? (summary.clicks / summary.views).toFixed(2) : '–'} />
              <StatTile label="Most used" value={summary.rows[0]?.clicks ? (summary.rows[0].tile?.title ?? 'Removed tile') : '–'} />
            </div>

            <section className="stats__card">
              <h3>Daily activity</h3>
              <TrendChart days={days} />
            </section>

            <section className="stats__card">
              <h3>Clicks per tool</h3>
              <Ranking rows={summary.rows} total={summary.clicks} />
            </section>

            <p className="field__hint">
              Counts are anonymous daily totals: a view is one page load, a click is one opened tool. Days follow Latvian time.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value" title={value}>
        {value}
      </span>
    </div>
  );
}

function Ranking({ rows, total }: { rows: { id: string; tile?: Tile; clicks: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.clicks));
  if (!rows.length) return <p className="field__hint">No tiles yet.</p>;
  return (
    <table className="ranking">
      <thead>
        <tr>
          <th scope="col">Tool</th>
          <th scope="col" className="ranking__bar-col">
            <span className="sr-only">Share</span>
          </th>
          <th scope="col" className="num">Clicks</th>
          <th scope="col" className="num">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.clicks ? undefined : 'is-zero'}>
            <td>
              <span className="ranking__tool">
                <span className="ranking__icon">{r.tile ? <TileIcon icon={r.tile.icon} size={16} /> : null}</span>
                {r.tile ? r.tile.title : <em>Removed tile</em>}
              </span>
            </td>
            <td className="ranking__bar-col">
              <span className="ranking__track">
                {r.clicks > 0 && <span className="ranking__bar" style={{ width: `${(r.clicks / max) * 100}%` }} />}
              </span>
            </td>
            <td className="num">{fmt.format(r.clicks)}</td>
            <td className="num muted">{total ? pct.format(r.clicks / total) : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Views and clicks share one axis: both are counts per day.
function TrendChart({ days }: { days: StatsDay[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 200;
  const pad = { t: 12, r: 12, b: 26, l: 40 };
  const series = days.map((d) => ({ date: d.date, views: d.views, clicks: Object.values(d.clicks).reduce((a, b) => a + b, 0) }));
  const yMax = niceMax(Math.max(1, ...series.map((s) => Math.max(s.views, s.clicks))));
  const ticks = [0, yMax / 2, yMax];
  const x = (i: number) => pad.l + (series.length === 1 ? 0.5 : i / (series.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const line = (k: 'views' | 'clicks') => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join('');
  const xLabels = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.round(rel * (series.length - 1)));
  };

  const h = hover !== null ? series[hover] : null;
  const allZero = series.every((s) => !s.views && !s.clicks);

  return (
    <div className="trend" ref={wrap}>
      <div className="legend">
        <span className="legend__item">
          <span className="legend__swatch legend__swatch--views" /> Page views
        </span>
        <span className="legend__item">
          <span className="legend__swatch legend__swatch--clicks" /> Tool clicks
        </span>
      </div>
      <svg width={width} height={H} role="img" aria-label="Daily page views and tool clicks">
        {ticks.map((t) => (
          <g key={t}>
            <line className="trend__grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
            <text className="trend__axis" x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmt.format(t)}
            </text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text key={i} className="trend__axis" x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}>
            {dayLabel(series[i].date)}
          </text>
        ))}
        <path className="trend__line trend__line--views" d={line('views')} />
        <path className="trend__line trend__line--clicks" d={line('clicks')} />
        {h && hover !== null && (
          <g>
            <line className="trend__cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} />
            <circle className="trend__dot trend__dot--views" cx={x(hover)} cy={y(h.views)} r={4} />
            <circle className="trend__dot trend__dot--clicks" cx={x(hover)} cy={y(h.clicks)} r={4} />
          </g>
        )}
        <rect
          x={pad.l}
          y={pad.t}
          width={Math.max(0, width - pad.l - pad.r)}
          height={H - pad.t - pad.b}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {allZero && <div className="trend__empty">No activity in this period yet</div>}
      {h && hover !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(hover), 90), width - 90), top: pad.t }}>
          <strong>{dayLabel(h.date, true)}</strong>
          <span>
            <span className="legend__swatch legend__swatch--views" /> {fmt.format(h.views)} views
          </span>
          <span>
            <span className="legend__swatch legend__swatch--clicks" /> {fmt.format(h.clicks)} clicks
          </span>
        </div>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  const max = step * exp;
  return max < 2 ? 2 : max % 2 ? max * 2 : max; // keep the midpoint tick an integer
}
