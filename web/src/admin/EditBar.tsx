import { useEffect, useRef, useState } from 'react';
import { BarChart3, Check, LogOut, Palette, Pencil, Plus, Settings, UserRound, X } from 'lucide-react';
import type { Me } from '../api';
import { THEMES, prefs, type Surface, type ThemeChoice } from '../theme';

type Props = {
  me: Me;
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  /** the page default colour mode, shown next to "Page default" */
  siteMode: ThemeChoice;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onSettings: () => void;
  onStats: () => void;
  onAddGroup: () => void;
  onLogout: () => void;
  /** the viewer changed their own theme or glass/solid choice */
  onLook: () => void;
};

function initials(name?: string) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const label = (id: ThemeChoice) => THEMES.find((t) => t.id === id)?.label ?? id;

/** The dark round profile button and its menu: who is signed in, appearance, sign out. */
function ProfileMenu({ me, siteMode, onLogout, onLook }: Pick<Props, 'me' | 'siteMode' | 'onLogout' | 'onLook'>) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice | null>(prefs.theme);
  const [surface, setSurface] = useState<Surface>(prefs.surface);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => !anchor.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close);
    };
  }, [open]);

  const pickTheme = (v: ThemeChoice | null) => {
    prefs.setTheme(v);
    setTheme(v);
    onLook();
  };
  const pickSurface = (v: Surface) => {
    prefs.setSurface(v);
    setSurface(v);
    onLook();
  };

  const ini = initials(me.name);
  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        className="rb dk"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={me.name ? `Profile: ${me.name}` : 'Profile and appearance'}
        title={me.name ?? 'Appearance'}
      >
        {ini || <UserRound size={20} />}
      </button>
      {open && (
        <div className="menu" role="menu">
          {me.name && (
            <div className="menu__who">
              {me.name}
              <span>{me.isAdmin ? 'Administrator' : 'Signed in'}</span>
            </div>
          )}
          {me.name && <div className="menu__sep" />}
          <div className="menu__title">Appearance</div>
          <button className="menu__item" role="menuitemradio" aria-checked={theme === null} onClick={() => pickTheme(null)}>
            <Palette size={16} />
            <span>
              Page default<span className="menu__note">{label(siteMode)}</span>
            </span>
            {theme === null && <Check size={16} className="menu__check" />}
          </button>
          {THEMES.map((t) => (
            <button key={t.id} className="menu__item" role="menuitemradio" aria-checked={theme === t.id} onClick={() => pickTheme(t.id)}>
              <span className={`swatch swatch--${t.id}`} aria-hidden="true" />
              {t.label}
              {theme === t.id && <Check size={16} className="menu__check" />}
            </button>
          ))}
          <div className="menu__seg">
            <div className="seg" role="group" aria-label="Surface">
              <button className={surface === 'glass' ? 'on' : ''} onClick={() => pickSurface('glass')} aria-pressed={surface === 'glass'}>
                Glass
              </button>
              <button className={surface === 'solid' ? 'on' : ''} onClick={() => pickSurface('solid')} aria-pressed={surface === 'solid'}>
                Solid
              </button>
            </div>
          </div>
          {me.signedIn && (
            <>
              <div className="menu__sep" />
              <button className="menu__item" role="menuitem" onClick={onLogout}>
                <LogOut size={16} /> Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function EditBar(p: Props) {
  const profile = <ProfileMenu me={p.me} siteMode={p.siteMode} onLogout={p.onLogout} onLook={p.onLook} />;

  if (!p.editing) {
    return (
      <div className="topbar__actions">
        {p.me.isAdmin && (
          <>
            <button className="btn" onClick={p.onStats}>
              <BarChart3 size={17} /> Statistics
            </button>
            <button className="btn" onClick={p.onEdit}>
              <Pencil size={17} /> Edit page
            </button>
          </>
        )}
        {profile}
      </div>
    );
  }
  return (
    <div className="topbar__actions">
      <span className="badge">Editing</span>
      <button className="btn" onClick={p.onAddGroup}>
        <Plus size={17} /> Section
      </button>
      <button className="btn" onClick={p.onSettings}>
        <Settings size={17} /> Settings
      </button>
      <button className="btn btn--ghost" onClick={p.onCancel}>
        <X size={17} /> Cancel
      </button>
      <button className="btn btn--primary" onClick={p.onSave} disabled={!p.dirty || p.saving}>
        <Check size={17} /> {p.saving ? 'Saving…' : 'Save'}
      </button>
      {profile}
    </div>
  );
}
