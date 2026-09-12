/**
 * BuildModel: the single source of truth.
 *
 * The 2D pane is the only editor; the 3D pane subscribes to the events emitted
 * here and applies deltas. Mutations are deliberately low level and unchecked
 * for validity, because every user-facing mutation goes through a command in
 * commands.js, which is what makes undo uniform.
 */
import { Emitter } from './events.js';
import { Occupancy } from './occupancy.js';
import { catalog as defaultCatalog } from './catalog.js';
import { regionExtent } from './validate.js';
import { normalizeRotation } from './geometry.js';

export const SCHEMA_VERSION = 1;

let idCounter = 0;
const nextId = () => `p${++idCounter}`;

/** The grid defaults to the buildable region, so there is no dead space. */
export function defaultGrid(catalog = defaultCatalog) {
  const defining = catalog.regionDefiningElement();
  const { width, depth } = defining
    ? regionExtent(defining)
    : { width: 64, depth: 64 };
  return { width, depth, height: 16 };
}

export class BuildModel extends Emitter {
  constructor({ catalog = defaultCatalog, grid, name = 'Untitled construction' } = {}) {
    super();
    this.catalog = catalog;
    this.grid = grid ?? defaultGrid(catalog);
    this.name = name;
    this.occupancy = new Occupancy();
    this.selection = new Set();
    this.slice = 0;
    this._pieces = new Map();
  }

  pieces() {
    return [...this._pieces.values()];
  }

  piece(id) {
    return this._pieces.get(id) ?? null;
  }

  get count() {
    return this._pieces.size;
  }

  elementOf(piece) {
    return this.catalog.get(piece.type);
  }

  addPiece({ id = nextId(), type, x, y, z, rot = 0 }) {
    const piece = { id, type, x, y, z, rot: normalizeRotation(rot) };
    this._pieces.set(piece.id, piece);
    this.occupancy.add(piece, this.elementOf(piece));
    this.emit('piece:add', piece);
    this.emit('change', { reason: 'piece:add', piece });
    return piece;
  }

  removePiece(id) {
    const piece = this._pieces.get(id);
    if (!piece) return null;
    this.occupancy.remove(piece, this.elementOf(piece));
    this._pieces.delete(id);
    this.selection.delete(id);
    this.emit('piece:remove', piece);
    this.emit('change', { reason: 'piece:remove', piece });
    return piece;
  }

  /** Move or rotate in place. The occupancy index is patched, not rebuilt. */
  updatePiece(id, patch) {
    const piece = this._pieces.get(id);
    if (!piece) return null;
    const element = this.elementOf(piece);
    this.occupancy.remove(piece, element);
    Object.assign(piece, patch);
    if (patch.rot != null) piece.rot = normalizeRotation(patch.rot);
    this.occupancy.add(piece, element);
    this.emit('piece:update', piece);
    this.emit('change', { reason: 'piece:update', piece });
    return piece;
  }

  select(ids, { additive = false } = {}) {
    const list = Array.isArray(ids) ? ids : [ids].filter(Boolean);
    if (!additive) this.selection.clear();
    for (const id of list) if (this._pieces.has(id)) this.selection.add(id);
    this.emit('selection:change', [...this.selection]);
  }

  clearSelection() {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.emit('selection:change', []);
  }

  setSlice(z) {
    const clamped = Math.max(0, Math.min(this.grid.height - 1, Math.round(z)));
    if (clamped === this.slice) return;
    this.slice = clamped;
    this.emit('slice:change', clamped);
  }

  setName(name) {
    this.name = name;
    this.emit('change', { reason: 'name' });
  }

  /** Replace all contents, used by load and import. */
  reset({ grid, name, pieces = [] } = {}) {
    this._pieces.clear();
    this.occupancy.clear();
    this.selection.clear();
    if (grid) this.grid = grid;
    if (name) this.name = name;
    for (const spec of pieces) {
      const piece = { ...spec, rot: normalizeRotation(spec.rot ?? 0) };
      this._pieces.set(piece.id, piece);
      this.occupancy.add(piece, this.elementOf(piece));
      // Keep generated ids ahead of loaded ones so they cannot collide.
      const n = Number.parseInt(String(piece.id).replace(/^p/, ''), 10);
      if (Number.isFinite(n)) idCounter = Math.max(idCounter, n);
    }
    this.emit('reset', this);
    this.emit('change', { reason: 'reset' });
  }
}
