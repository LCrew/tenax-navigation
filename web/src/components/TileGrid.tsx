import type { MouseEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Group, Tile as TileT } from '../../../shared/schema';
import { Tile } from './Tile';

export type GridActions = {
  editTile: (groupId: string, tile: TileT | null) => void;
  deleteTile: (groupId: string, tileId: string) => void;
  moveTile: (groupId: string, fromId: string, toId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  deleteGroup: (groupId: string) => void;
  moveGroup: (groupId: string, dir: -1 | 1) => void;
};

type Props = {
  groups: Group[];
  editing: boolean;
  onOpen: (tile: TileT, e: MouseEvent<HTMLAnchorElement>) => void;
  actions: GridActions;
};

function SortableTile({ groupId, tile, actions }: { groupId: string; tile: TileT; actions: GridActions }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id });
  return (
    <div
      ref={setNodeRef}
      className={`tile-edit${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
  document.dispatchEvent(new CustomEvent('toast', { detail: `Click delete again to remove “${key}”` }));
  return false;
}

export function TileGrid({ groups, editing, onOpen, actions }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="groups">
      {groups.map((g, gi) => (
        <section key={g.id} className="group" aria-label={g.name || 'Links'}>
          {editing ? (
            <div className="group__head group__head--edit">
              <input
                className="input group__name-input"
                value={g.name}
                placeholder="Section name (optional)"
                onChange={(e) => actions.renameGroup(g.id, e.target.value)}
              />
              <button className="icon-btn" disabled={gi === 0} onClick={() => actions.moveGroup(g.id, -1)} title="Move section up">
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-btn"
                disabled={gi === groups.length - 1}
                onClick={() => actions.moveGroup(g.id, 1)}
                title="Move section down"
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="icon-btn icon-btn--danger"
                onClick={() => confirmDelete(g.name || 'section') && actions.deleteGroup(g.id)}
                title="Delete section"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            g.name && <h2 className="group__head">{g.name}</h2>
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
                    <SortableTile key={t.id} groupId={g.id} tile={t} actions={actions} />
                  ))}
                  <button className="tile-add" onClick={() => actions.editTile(g.id, null)}>
                    <Plus size={28} />
                    <span>Add tile</span>
                  </button>
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="grid">
              {g.tiles.map((t) => (
                <Tile key={t.id} tile={t} onOpen={onOpen} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
