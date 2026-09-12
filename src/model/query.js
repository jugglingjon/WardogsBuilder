/**
 * Read-only questions about a build that more than one part of the UI asks.
 */
import { boundsOf } from './geometry.js';

/** A rectangle in grid coordinates, normalised so x0 <= x1 and y0 <= y1. */
export function normalizeRect(a, b) {
  return {
    x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x) + 1, y1: Math.max(a.y, b.y) + 1
  };
}

/**
 * The pieces a marquee should select: those whose footprint overlaps the
 * rectangle and whose volume includes the slice being edited.
 *
 * Restricting to the slice keeps the marquee honest. Only pieces drawn solid
 * can be caught by it, so a drag never picks up something the user cannot see.
 */
export function piecesInRect(model, rect, slice = model.slice) {
  return model.pieces()
    .filter((piece) => {
      const b = boundsOf(piece, model.elementOf(piece));
      if (slice < b.z0 || slice >= b.z1) return false;
      return b.x0 < rect.x1 && rect.x0 < b.x1 && b.y0 < rect.y1 && rect.y0 < b.y1;
    })
    .map((piece) => piece.id);
}

/** The smallest grid box containing these pieces. */
export function boundsOfPieces(model, ids) {
  let box = null;
  for (const id of ids) {
    const piece = model.piece(id);
    if (!piece) continue;
    const b = boundsOf(piece, model.elementOf(piece));
    box = box
      ? {
          x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), z0: Math.min(box.z0, b.z0),
          x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1), z1: Math.max(box.z1, b.z1)
        }
      : { x0: b.x0, y0: b.y0, z0: b.z0, x1: b.x1, y1: b.y1, z1: b.z1 };
  }
  return box;
}
