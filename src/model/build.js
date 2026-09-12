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

/**
 * The site is exactly the buildable region and nothing more: the FOB sits at
 * the centre and the ground reaches 50 m from it in every direction. There is
 * no reason for a plane larger than the area you may build on.
 */
export function defaultGrid(catalog = defaultCatalog) {
  const defining = catalog.regionDefiningElement();
  const { width, depth } = defining
    ? regionExtent(defining)
    : { width: 64, depth: 64 };
  return { width, depth, height: 16 };
}

/** Where a fixture sits: centred on the site, on the ground. */
export function fixtureSpec(element, grid) {
  return {
    type: element.id,
    x: Math.floor((grid.width - element.size[0]) / 2),
    y: Math.floor((grid.depth - element.size[1]) / 2),
    z: 0,
    rot: 0
  };
}

export class BuildModel extends Emitter {
  constructor({ catalog = defaultCatalog, grid, name = 'Untitled construction' } = {}) {
    super();
    this.catalog = catalog;
    this.grid = grid ?? defaultGrid(catalog);
    this.name = name;
    this.occupancy = new Occupancy();
    this.selection = new Set();
    this.revision = 0;
    this._pieces = new Map();
    this._list = null;
    this.#ensureFixtures();
  }

  /**
   * Put the site's fixtures where they belong, adding what is missing and
   * moving anything an older save or a shared link left elsewhere. Called on
   * construction and after every load, so a build always has exactly one FOB
   * and it is always in the middle.
   */
  #ensureFixtures() {
    for (const element of this.catalog.fixtures()) {
      const spec = fixtureSpec(element, this.grid);
      const existing = this.pieces().filter((p) => p.type === element.id);

      for (const extra of existing.slice(1)) this.#force(() => this.removePiece(extra.id));
      const piece = existing[0];

      if (!piece) {
        this.#force(() => this.addPiece(spec));
      } else if (piece.x !== spec.x || piece.y !== spec.y || piece.z !== spec.z || piece.rot !== 0) {
        this.#force(() => this.updatePiece(piece.id, spec));
      }
    }
  }

  /** Fixtures are immutable to everyone except the code that positions them. */
  #force(change) {
    this._placing = true;
    try { change(); } finally { this._placing = false; }
  }

  isFixed(piece) {
    return Boolean(piece && this.catalog.get(piece.type).fixed);
  }

  /** Pieces the user actually placed, which is what the UI counts and prices. */
  placed() {
    return this.pieces().filter((piece) => !this.isFixed(piece));
  }

  get placedCount() {
    return this.placed().length;
  }

  /**
   * Cached, because canPlace runs over every piece during validation and a
   * fresh array per call is the difference between linear and quadratic.
   * Treat the result as read-only.
   */
  pieces() {
    return (this._list ??= [...this._pieces.values()]);
  }

  #touch() {
    this._list = null;
    this.revision++;
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
    this.#touch();
    this.emit('piece:add', piece);
    this.emit('change', { reason: 'piece:add', piece });
    return piece;
  }

  removePiece(id) {
    const piece = this._pieces.get(id);
    if (!piece) return null;
    if (this.isFixed(piece) && !this._placing) return null;
    this.occupancy.remove(piece, this.elementOf(piece));
    this._pieces.delete(id);
    this.selection.delete(id);
    this.#touch();
    this.emit('piece:remove', piece);
    this.emit('change', { reason: 'piece:remove', piece });
    return piece;
  }

  /** Move or rotate in place. The occupancy index is patched, not rebuilt. */
  updatePiece(id, patch) {
    const piece = this._pieces.get(id);
    if (!piece) return null;
    if (this.isFixed(piece) && !this._placing) return null;
    const element = this.elementOf(piece);
    this.occupancy.remove(piece, element);
    Object.assign(piece, patch);
    if (patch.rot != null) piece.rot = normalizeRotation(patch.rot);
    this.occupancy.add(piece, element);
    this.#touch();
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

  setName(name) {
    this.name = name;
    this.emit('change', { reason: 'name' });
  }

  /** Replace all contents, used by load and import. */
  reset({ grid, name, pieces = [] } = {}) {
    this._pieces.clear();
    this.occupancy.clear();
    this.selection.clear();
    this.#touch();
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
    this.#touch();
    this.#ensureFixtures();
    this.emit('reset', this);
    this.emit('change', { reason: 'reset' });
  }
}
