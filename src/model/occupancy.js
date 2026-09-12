/**
 * Occupancy index: one entry per occupied cubic metre, pointing at the piece
 * filling it. Updated incrementally on every add and remove, never by
 * rescanning the build.
 *
 * A heavily built 103x103x16 region is tens of thousands of entries, which a
 * Map handles without trouble, so a sparse octree would be premature.
 */
import { cellsOf } from './geometry.js';

export const keyOf = (x, y, z) => `${z}:${x}:${y}`;

export class Occupancy {
  #cells = new Map();

  add(piece, element) {
    for (const [x, y, z] of cellsOf(piece, element)) {
      this.#cells.set(keyOf(x, y, z), piece.id);
    }
  }

  remove(piece, element) {
    for (const [x, y, z] of cellsOf(piece, element)) {
      const key = keyOf(x, y, z);
      if (this.#cells.get(key) === piece.id) this.#cells.delete(key);
    }
  }

  /** The id of the piece filling a cell, or null. */
  at(x, y, z) {
    return this.#cells.get(keyOf(x, y, z)) ?? null;
  }

  isFree(x, y, z) {
    return !this.#cells.has(keyOf(x, y, z));
  }

  /**
   * The height of the highest occupied cell in a column, plus one: the z a
   * piece would rest at if dropped down this column. 0 means bare ground.
   */
  surfaceZ(x, y, ceiling) {
    for (let z = ceiling - 1; z >= 0; z--) {
      if (!this.isFree(x, y, z)) return z + 1;
    }
    return 0;
  }

  get size() {
    return this.#cells.size;
  }

  clear() {
    this.#cells.clear();
  }
}
