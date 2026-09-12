/**
 * Screen-space selection: which pieces fall inside a rectangle dragged over the
 * view.
 *
 * Occlusion is deliberately ignored. A marquee that skipped the pieces hidden
 * behind a wall would be useless for the thing marquees are for, which is
 * grabbing a whole run at once.
 */
import * as THREE from 'three';
import { boundsOf } from '../model/geometry.js';

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
  [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]
];

const point = new THREE.Vector3();
const cameraSpace = new THREE.Vector3();

/**
 * The rectangle a piece covers on screen, or null when it is entirely behind
 * the camera. Corners behind the camera are dropped rather than projected,
 * since projecting them mirrors the point to the wrong side of the view.
 */
export function screenBoundsOfPiece(piece, element, camera, viewport) {
  const b = boundsOf(piece, element);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let seen = 0;

  for (const [cx, cy, cz] of CORNERS) {
    point.set(
      cx ? b.x1 : b.x0,
      cy ? b.z1 : b.z0,   // grid height is world Y
      cz ? b.y1 : b.y0
    );
    cameraSpace.copy(point).applyMatrix4(camera.matrixWorldInverse);
    if (cameraSpace.z > -camera.near) continue; // behind the lens

    point.project(camera);
    const sx = (point.x + 1) / 2 * viewport.width;
    const sy = (-point.y + 1) / 2 * viewport.height;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    seen++;
  }

  return seen ? { x0, y0, x1, y1 } : null;
}

export function rectsOverlap(a, b) {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

/** Normalised from two corners, in the canvas's own pixel space. */
export function normalizeScreenRect(from, to) {
  return {
    x0: Math.min(from.x, to.x), y0: Math.min(from.y, to.y),
    x1: Math.max(from.x, to.x), y1: Math.max(from.y, to.y)
  };
}

/** Every piece the rectangle touches. */
export function piecesInScreenRect(model, camera, viewport, rect) {
  camera.updateMatrixWorld();
  const ids = [];
  for (const piece of model.pieces()) {
    const bounds = screenBoundsOfPiece(piece, model.elementOf(piece), camera, viewport);
    if (bounds && rectsOverlap(bounds, rect)) ids.push(piece.id);
  }
  return ids;
}
