/**
 * Grid maths. Pure functions, no state.
 *
 * Coordinates: x runs along width, y along depth, z is height above ground.
 * One cell is one cubic metre. A piece is stored as its minimum corner, so a
 * 4x4x4 Bunker at (10, 10, 0) fills x 10..13, y 10..13, z 0..3.
 *
 * three.js uses Y for up, so gridToWorld() owns that swap. Both panes call it,
 * which is what stops the two views drifting apart.
 */

export const ROTATIONS = [0, 90, 180, 270];

export function normalizeRotation(rot) {
  return ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
}

/** Width and depth swap at 90 and 270. Height never changes. */
export function rotatedSize(size, rot = 0) {
  const [w, d, h] = size;
  return normalizeRotation(rot) % 180 === 90 ? [d, w, h] : [w, d, h];
}

/** The axis-aligned box a piece fills, as half-open [min, max) bounds. */
export function boundsOf(piece, element) {
  const [w, d, h] = rotatedSize(element.size, piece.rot);
  return {
    x0: piece.x, x1: piece.x + w,
    y0: piece.y, y1: piece.y + d,
    z0: piece.z, z1: piece.z + h,
    w, d, h
  };
}

/** Every cell the piece occupies. */
export function* cellsOf(piece, element) {
  const b = boundsOf(piece, element);
  for (let z = b.z0; z < b.z1; z++)
    for (let y = b.y0; y < b.y1; y++)
      for (let x = b.x0; x < b.x1; x++)
        yield [x, y, z];
}

/** The footprint cells at the piece's base, used for support tests. */
export function* baseCellsOf(piece, element) {
  const b = boundsOf(piece, element);
  for (let y = b.y0; y < b.y1; y++)
    for (let x = b.x0; x < b.x1; x++)
      yield [x, y, b.z0];
}

/** The z of the piece's top face. A 1m block at z=0 has its top at z=1. */
export function topOf(piece, element) {
  return boundsOf(piece, element).z1;
}

export function boxesOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 &&
         a.y0 < b.y1 && b.y0 < a.y1 &&
         a.z0 < b.z1 && b.z0 < a.z1;
}

/**
 * Grid coordinates to three.js world space.
 * Grid z (height) becomes world Y; grid y (depth) becomes world Z.
 */
export function gridToWorld(x, y, z) {
  return { x, y: z, z: y };
}

/** World-space centre of a piece, which is where its box mesh is positioned. */
export function pieceCenterWorld(piece, element) {
  const b = boundsOf(piece, element);
  return gridToWorld(
    b.x0 + b.w / 2,
    b.y0 + b.d / 2,
    b.z0 + b.h / 2
  );
}
