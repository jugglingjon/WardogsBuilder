/**
 * Read-only questions about a build that more than one part of the UI asks.
 */
import { boundsOf } from './geometry.js';

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
