import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Config, Tile as TileT } from '../../shared/schema';
import { EditBar } from './admin/EditBar';
import { SettingsPanel } from './admin/SettingsPanel';
import { StatsPanel } from './admin/StatsPanel';
import { TileEditor } from './admin/TileEditor';
import { api, newId, type Me } from './api';
import { TileGrid, type GridActions } from './components/TileGrid';
import { Viewer } from './components/Viewer';
import { WarningDialog } from './components/WarningDialog';
import { applyTheme, watchScheme } from './theme';

let viewTracked = false;

const openIdFromHash = () => decodeURIComponent(location.hash.match(/^#\/open\/(.+)$/)?.[1] ?? '') || null;

function shouldOpenInNewTab(tile: TileT) {
  if (tile.openMode === 'newTab') return true;
  if (location.protocol === 'https:' && tile.url.startsWith('http:')) return true; // mixed content is blocked in iframes
  return tile.openMode === 'auto' && tile.embeddable === false;
}

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [me, setMe] = useState<Me>({ signedIn: false, isAdmin: false });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState(openIdFromHash);
  /** tile whose warning was accepted for the current opening; cleared whenever the address changes */
  const [accepted, setAccepted] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ groupId: string; tile: TileT | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [look, setLook] = useState(0); // bumps when the viewer changes their theme / glass choice
  const [compact, setCompact] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const editing = draft !== null;
  const shown = draft ?? config;

  useEffect(() => {
    api.config().then(setConfig, (e) => setLoadError(e.message));
    // tells public/boot.js the page has drawn, so the opening screen can fade out
    const ready = () => (document.documentElement.dataset.ready = '1');
    const t = setTimeout(ready, 6000);
    if (!viewTracked) {
      viewTracked = true; // StrictMode runs effects twice in dev
      api.track({ type: 'view' });
    }
    api.me().then(setMe, () => {});
    const onHash = () => {
      setOpenId(openIdFromHash());
      setAccepted(null);
    };
    const onToast = (e: Event) => setToast((e as CustomEvent<string>).detail);
    window.addEventListener('hashchange', onHash);
    document.addEventListener('toast', onToast);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('toast', onToast);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (config || loadError) requestAnimationFrame(() => (document.documentElement.dataset.ready = '1'));
  }, [config, loadError]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!shown) return;
    applyTheme(shown.site);
    return watchScheme(() => applyTheme(shown.site));
  }, [shown?.site, look]);

  // compact frosted bar once the big title has scrolled out of view
  const hasPage = !!shown;
  useEffect(() => {
    const el = titleRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [hasPage]);

  const dirty = useMemo(() => editing && JSON.stringify(draft) !== JSON.stringify(config), [draft, config, editing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const openTile = useCallback((tile: TileT, e: MouseEvent<HTMLAnchorElement>) => {
    // anchor's target=_blank handles it; a tile with a warning always shows the warning here first
    if (!tile.warning && shouldOpenInNewTab(tile)) return;
    e.preventDefault();
    location.hash = `/open/${encodeURIComponent(tile.id)}`;
  }, []);
  const closeViewer = useCallback(() => {
    if (history.length > 1 && openIdFromHash()) history.back();
    else history.replaceState(null, '', location.pathname);
    setOpenId(null);
  }, []);
  const acceptWarning = (tile: TileT) => {
    if (!shouldOpenInNewTab(tile)) return setAccepted(tile.id);
    window.open(tile.url, '_blank', 'noopener,noreferrer');
    closeViewer();
  };

  const update = (fn: (c: Config) => Config) => setDraft((d) => (d ? fn(d) : d));
  const mapGroup = (id: string, fn: (g: Config['groups'][number]) => Config['groups'][number]) =>
    update((c) => ({ ...c, groups: c.groups.map((g) => (g.id === id ? fn(g) : g)) }));

  const actions: GridActions = {
    editTile: (groupId, tile) => setEditor({ groupId, tile }),
    deleteTile: (groupId, tileId) => mapGroup(groupId, (g) => ({ ...g, tiles: g.tiles.filter((t) => t.id !== tileId) })),
    moveTile: (groupId, fromId, toId) =>
      mapGroup(groupId, (g) => {
        const tiles = [...g.tiles];
        const from = tiles.findIndex((t) => t.id === fromId);
        const to = tiles.findIndex((t) => t.id === toId);
        tiles.splice(to, 0, tiles.splice(from, 1)[0]);
        return { ...g, tiles };
      }),
    renameGroup: (groupId, name) => mapGroup(groupId, (g) => ({ ...g, name })),
    setGroupLogo: (groupId, logoUrl) =>
      mapGroup(groupId, (g) => {
        const { logoUrl: _old, ...rest } = g;
        return logoUrl ? { ...rest, logoUrl } : rest;
      }),
    setGroupAdminOnly: (groupId, adminOnly) =>
      mapGroup(groupId, (g) => {
        const { adminOnly: _old, ...rest } = g;
        return adminOnly ? { ...rest, adminOnly: true } : rest;
      }),
    deleteGroup: (groupId) => update((c) => ({ ...c, groups: c.groups.filter((g) => g.id !== groupId) })),
    moveGroup: (groupId, dir) =>
      update((c) => {
        const groups = [...c.groups];
        const i = groups.findIndex((g) => g.id === groupId);
        [groups[i], groups[i + dir]] = [groups[i + dir], groups[i]];
        return { ...c, groups };
      }),
  };

  const saveTile = (groupId: string, tile: TileT) => {
    update((c) => ({
      ...c,
      groups: c.groups.map((g) => {
        const without = g.tiles.filter((t) => t.id !== tile.id);
        if (g.id !== groupId) return { ...g, tiles: without };
        const idx = g.tiles.findIndex((t) => t.id === tile.id);
        if (idx === -1) return { ...g, tiles: [...without, tile] };
        const tiles = [...g.tiles];
        tiles[idx] = tile;
        return { ...g, tiles };
      }),
    }));
    setEditor(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api.saveConfig(draft);
      setConfig(saved);
      setDraft(null);
      setToast('Saved');
    } catch (e: any) {
      setToast(`Save failed: ${e.message}`);
      if (/sign|401/i.test(e.message)) api.me().then(setMe);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <div className="center">Could not load navigation: {loadError}</div>;
  if (!shown) return <div className="center" aria-busy="true"><span className="spinner" /></div>;

  const openTileObj = openId ? shown.groups.flatMap((g) => g.tiles).find((t) => t.id === openId) : undefined;
  // a tile with a warning shows the warning first, its page only once accepted
  const warnTile = openTileObj?.warning && accepted !== openTileObj.id ? openTileObj : undefined;
  const viewTile = warnTile ? undefined : openTileObj;

  return (
    <>
      <div className={`cbar${compact && !viewTile ? ' on' : ''}`} aria-hidden={!compact}>
        <div className="cbar__inner">
          {shown.site.logoUrl && <img src={shown.site.logoUrl} alt="" className="cbar__logo" />}
          <span className="cbar__title">{shown.site.title}</span>
          {editing && (
            <button className="btn btn--sm btn--primary" onClick={save} disabled={!dirty || saving} tabIndex={compact ? 0 : -1}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <div className={`page${viewTile ? ' page--behind' : ''}`} aria-hidden={!!openTileObj && !editing}>
        <header className="topbar">
          <div className="brand">
            {shown.site.logoUrl && <img src={shown.site.logoUrl} alt="" className="brand__logo" />}
            <h1 className="page-title" ref={titleRef}>{shown.site.title}</h1>
          </div>
          <EditBar
            me={me}
            editing={editing}
            dirty={dirty}
            saving={saving}
            siteMode={shown.site.mode}
            onLook={() => setLook((n) => n + 1)}
            onEdit={() => config && setDraft(structuredClone(config))}
            onCancel={() => setDraft(null)}
            onSave={save}
            onSettings={() => setSettingsOpen(true)}
            onStats={() => setStatsOpen(true)}
            onAddGroup={() => update((c) => ({ ...c, groups: [...c.groups, { id: newId(), name: 'New section', tiles: [] }] }))}
            onLogout={() => api.logout()}
          />
        </header>
        <main>
          <TileGrid groups={shown.groups} editing={editing} onOpen={openTile} actions={actions} />
          {!editing && shown.groups.every((g) => g.tiles.length === 0) && <p className="empty">No links yet.</p>}
        </main>
      </div>

      {viewTile && !editing && <Viewer tile={viewTile} onClose={closeViewer} />}
      {warnTile?.warning && !editing && (
        <WarningDialog
          key={warnTile.id}
          tile={warnTile}
          warning={warnTile.warning}
          onAccept={() => acceptWarning(warnTile)}
          onCancel={closeViewer}
        />
      )}

      {editor && draft && (
        <TileEditor
          tile={editor.tile}
          groupId={editor.groupId}
          groups={draft.groups}
          accent={draft.site.theme.accent}
          onSave={saveTile}
          onClose={() => setEditor(null)}
        />
      )}
      {settingsOpen && draft && <SettingsPanel config={draft} onChange={setDraft} onClose={() => setSettingsOpen(false)} />}
      {statsOpen && config && <StatsPanel config={config} onClose={() => setStatsOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
