import { BarChart3, Check, LogOut, Pencil, Plus, Settings, X } from 'lucide-react';
import type { Me } from '../api';

type Props = {
  me: Me;
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onSettings: () => void;
  onStats: () => void;
  onAddGroup: () => void;
  onLogout: () => void;
};

export function EditBar(p: Props) {
  if (!p.editing) {
    return (
      <div className="editbar">
        <span className="editbar__user">{p.me.name}</span>
        {p.me.isAdmin && (
          <>
            <button className="btn btn--sm" onClick={p.onStats}>
              <BarChart3 size={14} /> Statistics
            </button>
            <button className="btn btn--sm" onClick={p.onEdit}>
              <Pencil size={14} /> Edit page
            </button>
          </>
        )}
        <button className="icon-btn" onClick={p.onLogout} title="Sign out" aria-label="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="editbar editbar--active">
      <span className="editbar__badge">Editing</span>
      <button className="btn btn--sm" onClick={p.onAddGroup}>
        <Plus size={14} /> Section
      </button>
      <button className="btn btn--sm" onClick={p.onSettings}>
        <Settings size={14} /> Settings
      </button>
      <button className="btn btn--sm btn--ghost" onClick={p.onCancel}>
        <X size={14} /> Cancel
      </button>
      <button className="btn btn--sm btn--primary" onClick={p.onSave} disabled={!p.dirty || p.saving}>
        <Check size={14} /> {p.saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
