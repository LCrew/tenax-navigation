import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { Config, Tile as TileT } from '../../shared/schema';
import { EditBar } from './admin/EditBar';
import { SettingsPanel } from './admin/SettingsPanel';
import { TileEditor } from './admin/TileEditor';
import { api, newId, type Me } from './api';
import { TileGrid, type GridActions } from './components/TileGrid';
import { Viewer } from './components/Viewer';
import { applyTheme, watchScheme } from './theme';

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
  const [editor, setEditor] = useState<{ groupId: string; tile: TileT | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const editing = draft !== null;
  const shown = draft ?? config;

  useEffect(() => {
    api.config().then(setConfig, (e) => setLoadError(e.message));
    api.me().then(setMe, () => {});
    if (new URLSearchParams(location.search).has('denied')) {
      setToast('Your account does not have admin access.');
      history.replaceState(null, '', location.pathname + location.hash);
    }
    const onHash = () => setOpenId(openIdFromHash());
    const onToast = (e: Event) => setToast((e as CustomEvent<string>).detail);
    window.addEventListener('hashchange', onHash);
    document.addEventListener('toast', onToast);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('toast', onToast);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!shown) return;
    applyTheme(shown.site);
    return watchScheme(() => applyTheme(shown.site));
  }, [shown?.site]);

  const dirty = useMemo(() => editing && JSON.stringify(draft) !== JSON.stringify(config), [draft, config, editing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const openTile = useCallback((tile: TileT, e: MouseEvent<HTMLAnchorElement>) => {
    if (shouldOpenInNewTab(tile)) return; // anchor's target=_blank handles it
    e.preventDefault();
    location.hash = `/open/${encodeURIComponent(tile.id)}`;
  }, []);
  const closeViewer = useCallback(() => {
    if (history.length > 1 && openIdFromHash()) history.back();
    else history.replaceState(null, '', location.pathname);
    setOpenId(null);
  }, []);

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
  if (!shown) return <div className="center"><span className="spinner" /></div>;

  const openTileObj = openId ? shown.groups.flatMap((g) => g.tiles).find((t) => t.id === openId) : undefined;

  return (
    <>
      <div className={`page${openTileObj ? ' page--behind' : ''}`} aria-hidden={!!openTileObj}>
        <header className="topbar">
          <div className="brand">
            {shown.site.logoUrl && <img src={shown.site.logoUrl} alt="" className="brand__logo" />}
            <h1>{shown.site.title}</h1>
          </div>
          <EditBar
            me={me}
            editing={editing}
            dirty={dirty}
            saving={saving}
            onEdit={() => config && setDraft(structuredClone(config))}
            onCancel={() => setDraft(null)}
            onSave={save}
            onSettings={() => setSettingsOpen(true)}
            onAddGroup={() => update((c) => ({ ...c, groups: [...c.groups, { id: newId(), name: 'New section', tiles: [] }] }))}
            onLogout={() => api.logout().then(() => setMe({ signedIn: false, isAdmin: false }))}
          />
        </header>
        <main>
          <TileGrid groups={shown.groups} editing={editing} onOpen={openTile} actions={actions} />
          {!editing && shown.groups.every((g) => g.tiles.length === 0) && <p className="empty">No links yet.</p>}
        </main>
      </div>

      {openTileObj && !editing && <Viewer tile={openTileObj} onClose={closeViewer} />}

      {editor && draft && (
        <TileEditor
          tile={editor.tile}
          groupId={editor.groupId}
          groups={draft.groups}
          barColors={draft.site.theme.barColors}
          onSave={saveTile}
          onClose={() => setEditor(null)}
        />
      )}
      {settingsOpen && draft && <SettingsPanel config={draft} onChange={setDraft} onClose={() => setSettingsOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
