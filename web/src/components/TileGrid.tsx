import { useRef, useState, type MouseEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Group, Tile as TileT } from '../../../shared/schema';
import { api } from '../api';
import { Tile } from './Tile';

export type GridActions = {
  editTile: (groupId: string, tile: TileT | null) => void;
  deleteTile: (groupId: string, tileId: string) => void;
  moveTile: (groupId: string, fromId: string, toId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupLogo: (groupId: string, logoUrl: string | undefined) => void;
  deleteGroup: (groupId: string) => void;
  moveGroup: (groupId: string, dir: -1 | 1) => void;
};

type Props = {
  groups: Group[];
  editing: boolean;
  onOpen: (tile: TileT, e: MouseEvent<HTMLAnchorElement>) => void;
  actions: GridActions;
};

/** entrance stagger: 45 ms per tile, capped so long pages don't keep cascading */
const MAX_STAGGER = 12;

function toast(text: string) {
  document.dispatchEvent(new CustomEvent('toast', { detail: text }));
}

function SortableTile({ groupId, tile, index, actions }: { groupId: string; tile: TileT; index: number; actions: GridActions }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id });
  return (
    <div
      ref={setNodeRef}
      className={`tile-edit${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, ['--i' as string]: index }}
    >
      <Tile tile={tile} disabled />
      <div className="tile-edit__tools">
        <button className="icon-btn" {...attributes} {...listeners} aria-label={`Drag ${tile.title}`} title="Drag to reorder">
          <GripVertical size={16} />
        </button>
        <button className="icon-btn" onClick={() => actions.editTile(groupId, tile)} aria-label={`Edit ${tile.title}`} title="Edit">
          <Pencil size={16} />
        </button>
        <button
          className="icon-btn icon-btn--danger"
          onClick={() => confirmDelete(tile.title) && actions.deleteTile(groupId, tile.id)}
          aria-label={`Delete ${tile.title}`}
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

// Uses an inline confirm state rather than window.confirm to avoid blocking dialogs.
const pendingDeletes = new Map<string, number>();
function confirmDelete(key: string) {
  const now = Date.now();
  const prev = pendingDeletes.get(key);
  if (prev && now - prev < 3000) {
    pendingDeletes.delete(key);
    return true;
  }
  pendingDeletes.set(key, now);
  toast(`Click delete again to remove “${key}”`);
  return false;
}

/** Company logo for a section: upload / replace / remove in edit mode. */
function LogoSlot({ group, actions }: { group: Group; actions: GridActions }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const { path } = await api.upload(file);
      actions.setGroupLogo(group.id, path);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="logo-slot">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {group.logoUrl ? (
        <>
          <button className="logo-plate" onClick={() => input.current?.click()} title="Replace logo" disabled={busy}>
            <img src={group.logoUrl} alt="Section logo" />
          </button>
          <button className="icon-btn" onClick={() => actions.setGroupLogo(group.id, undefined)} aria-label="Remove logo" title="Remove logo">
            <X size={14} />
          </button>
        </>
      ) : (
        <button className="logo-slot__pick" onClick={() => input.current?.click()} disabled={busy} title="Add a company logo for this section">
          {busy ? <LoaderCircle size={18} className="spin-icon" /> : <ImagePlus size={18} />}
          <span>Logo</span>
        </button>
      )}
    </div>
  );
}

export function TileGrid({ groups, editing, onOpen, actions }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // one running index across all sections so the cascade flows down the page
  let n = 0;
  const next = () => Math.min(n++, MAX_STAGGER);

  return (
    <div className="groups">
      {groups.map((g, gi) => (
        <section key={g.id} className="group" aria-label={g.name || 'Links'}>
          {editing ? (
            <div className="group__head group__head--edit">
              <LogoSlot group={g} actions={actions} />
              <input
                className="input group__name-input"
                value={g.name}
                placeholder="Section name (optional)"
                onChange={(e) => actions.renameGroup(g.id, e.target.value)}
                aria-label="Section name"
              />
              <button className="icon-btn" disabled={gi === 0} onClick={() => actions.moveGroup(g.id, -1)} title="Move section up" aria-label="Move section up">
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-btn"
                disabled={gi === groups.length - 1}
                onClick={() => actions.moveGroup(g.id, 1)}
                title="Move section down"
                aria-label="Move section down"
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="icon-btn icon-btn--danger"
                onClick={() => confirmDelete(g.name || 'section') && actions.deleteGroup(g.id)}
                title="Delete section"
                aria-label="Delete section"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            (g.name || g.logoUrl) && (
              <div className="group__head">
                {g.logoUrl && (
                  <span className="logo-plate">
                    <img src={g.logoUrl} alt={g.name ? `${g.name} logo` : 'Company logo'} />
                  </span>
                )}
                {g.name && <h2 className="group__name">{g.name}</h2>}
              </div>
            )
          )}

          {editing ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e: DragEndEvent) => e.over && e.active.id !== e.over.id && actions.moveTile(g.id, String(e.active.id), String(e.over.id))}
            >
              <SortableContext items={g.tiles.map((t) => t.id)} strategy={rectSortingStrategy}>
                <div className="grid">
                  {g.tiles.map((t) => (
                    <SortableTile key={t.id} groupId={g.id} tile={t} index={next()} actions={actions} />
                  ))}
                  <button className="tile-add" onClick={() => actions.editTile(g.id, null)} style={{ ['--i' as string]: next() }}>
                    <Plus size={28} />
                    <span>Add tile</span>
                  </button>
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="grid">
              {g.tiles.map((t) => (
                <Tile key={t.id} tile={t} onOpen={onOpen} index={next()} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
