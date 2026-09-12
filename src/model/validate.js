/**
 * Placement and build rules.
 *
 * Placement rules are checked live while placing or moving, and report why they
 * failed so a rejected placement is never a mystery. Build rules are recomputed
 * on change and surfaced in the issues panel rather than blocking edits.
 */
import { boundsOf, baseCellsOf, cellsOf, rotatedSize } from './geometry.js';
import { Occupancy } from './occupancy.js';

export const REASON = {
  OUT_OF_GRID: 'out-of-grid',
  ABOVE_CEILING: 'above-ceiling',
  OUT_OF_REGION: 'out-of-region',
  OCCUPIED: 'occupied',
  UNSUPPORTED: 'unsupported',
  DUPLICATE: 'duplicate'
};

export const REASON_TEXT = {
  [REASON.OUT_OF_GRID]: 'Outside the site',
  [REASON.ABOVE_CEILING]: 'Above the build height limit',
  [REASON.OUT_OF_REGION]: 'Outside the build region',
  [REASON.OCCUPIED]: 'Overlaps something already placed',
  [REASON.UNSUPPORTED]: 'Not fully supported',
  [REASON.DUPLICATE]: 'Only one of these is allowed'
};

/**
 * The buildable region, which is the whole site.
 *
 * The FOB is fixed at the centre of the site, and the site is sized to reach
 * exactly 50 m from it in every direction, so the region and the ground are the
 * same rectangle by construction. Nothing has to scan the build to work out
 * where you may put things.
 */
export function buildRegion(model) {
  return { x0: 0, y0: 0, x1: model.grid.width, y1: model.grid.depth };
}

export const buildArea = buildRegion;

/** Region size in metres, used to size the default grid. */
export function regionExtent(element) {
  const margin = element.buildRegion?.marginFromFootprint ?? 0;
  const [w, d] = element.size;
  return { width: w + margin * 2, depth: d + margin * 2 };
}

function isSupportedAt(model, piece, element) {
  // Every cell of the base must rest on the ground or on the top face of a
  // supporting element. No overhangs, and only elements flagged canSupport.
  for (const [x, y, z] of baseCellsOf(piece, element)) {
    if (z === 0) continue;
    const belowId = model.occupancy.at(x, y, z - 1);
    if (!belowId || belowId === piece.id) return false;
    const below = model.piece(belowId);
    if (!below) return false;
    if (!model.catalog.get(below.type).canSupport) return false;
  }
  return true;
}

/**
 * Can this piece sit here? Returns every reason it cannot, not just the first,
 * so the placement ghost can explain itself.
 *
 * `ignoreId` and `ignore` exclude pieces from the collision test, which is what
 * makes nudging a piece, or a whole selection, one cell work.
 */
export function canPlace(model, piece, { ignoreId = null, ignore = null } = {}) {
  const ignored = ignore instanceof Set ? ignore : new Set(ignore ?? []);
  if (ignoreId) ignored.add(ignoreId);
  const element = model.catalog.get(piece.type);
  const reasons = new Set();
  const b = boundsOf(piece, element);
  const grid = model.grid;

  const region = buildRegion(model);
  if (b.x0 < region.x0 || b.y0 < region.y0 || b.x1 > region.x1 || b.y1 > region.y1) {
    reasons.add(REASON.OUT_OF_REGION);
  }

  if (b.z0 < 0) reasons.add(REASON.OUT_OF_GRID);
  if (b.z1 > grid.height) reasons.add(REASON.ABOVE_CEILING);

  for (const [x, y, z] of cellsOf(piece, element)) {
    const occupantId = model.occupancy.at(x, y, z);
    if (occupantId && !ignored.has(occupantId) && occupantId !== piece.id) {
      reasons.add(REASON.OCCUPIED);
      break;
    }
  }

  if (element.maxCount != null) {
    const existing = model.pieces()
      .filter((p) => p.type === piece.type && p.id !== piece.id && !ignored.has(p.id));
    if (existing.length >= element.maxCount) reasons.add(REASON.DUPLICATE);
  }

  if (!reasons.has(REASON.OCCUPIED) && !isSupportedAt(model, piece, element)) {
    reasons.add(REASON.UNSUPPORTED);
  }

  return { ok: reasons.size === 0, reasons: [...reasons] };
}

/**
 * The z a piece would rest at over this footprint, given a ceiling to search
 * down from. The highest column wins, so a piece spanning uneven ground sits on
 * top of the tallest thing under it rather than intersecting it.
 */
export function dropZ(model, piece, ceiling = model.grid.height) {
  const element = model.catalog.get(piece.type);
  const [w, d] = rotatedSize(element.size, piece.rot);
  let z = 0;
  for (let y = piece.y; y < piece.y + d; y++) {
    for (let x = piece.x; x < piece.x + w; x++) {
      z = Math.max(z, model.occupancy.surfaceZ(x, y, ceiling));
    }
  }
  return z;
}

/**
 * Where a piece the cursor is over should land: on top of whatever is already
 * in that column, or on the ground if it is clear.
 *
 * This is deliberately independent of the slice being edited. Standing on the
 * ground slice and hovering over a two metre stack should place on top of the
 * stack, not inside it, and since floating is illegal there is nowhere else a
 * piece could go. The slice decides what is drawn solid, not where pieces land.
 * Holding Alt overrides this and pins the piece to the slice exactly.
 */
export function restingZ(model, piece) {
  return dropZ(model, piece);
}

/**
 * A read-only stand-in for the model as it would be after an edit, so a
 * proposed move or paste can be validated by exactly the same rules that
 * validate a real placement. Nothing is mutated and no events fire.
 */
function projected(model, pieces) {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const occupancy = new Occupancy();
  const elementOf = (piece) => model.catalog.get(piece.type);

  // Claim cells first come first served and record every clash. Letting a later
  // piece overwrite the cell would hide the collision from both of them.
  const conflicts = new Set();
  for (const piece of pieces) {
    for (const [x, y, z] of cellsOf(piece, elementOf(piece))) {
      const owner = occupancy.at(x, y, z);
      if (owner) {
        conflicts.add(owner);
        conflicts.add(piece.id);
      } else {
        occupancy.set(x, y, z, piece.id);
      }
    }
  }

  return {
    conflicts,
    model: {
      catalog: model.catalog,
      grid: model.grid,
      occupancy,
      elementOf,
      pieces: () => pieces,
      piece: (id) => byId.get(id) ?? null
    }
  };
}

/**
 * Could this selection be translated by this offset?
 *
 * Validated as a rigid body against a projection of the whole build, so pieces
 * that support each other keep supporting each other through the move, and the
 * region moves with the FOB if the FOB is part of the selection.
 */
export function canMove(model, ids, { dx = 0, dy = 0, dz = 0 } = {}) {
  const moving = new Set(ids);
  const pieces = model.pieces().map((piece) => moving.has(piece.id)
    ? { ...piece, x: piece.x + dx, y: piece.y + dy, z: piece.z + dz }
    : piece);
  const { model: virtual, conflicts } = projected(model, pieces);

  const reasons = new Set();
  for (const id of moving) {
    const piece = virtual.piece(id);
    if (!piece) continue;
    if (conflicts.has(id)) reasons.add(REASON.OCCUPIED);
    for (const reason of canPlace(virtual, piece).reasons) reasons.add(reason);
  }
  return { ok: reasons.size === 0, reasons: [...reasons] };
}

/**
 * Could all of these pieces be added at once? Used by paste, which has to be
 * all or nothing: half a pasted structure is worse than none.
 */
export function canPlaceAll(model, specs) {
  const proposed = specs.map((spec, i) => ({ id: `__paste${i}__`, rot: 0, ...spec }));
  const { model: virtual, conflicts } = projected(model, [...model.pieces(), ...proposed]);

  const reasons = new Set();
  for (const piece of proposed) {
    if (conflicts.has(piece.id)) reasons.add(REASON.OCCUPIED);
    for (const reason of canPlace(virtual, piece).reasons) reasons.add(reason);
  }
  return { ok: reasons.size === 0, reasons: [...reasons] };
}

/** Build-level rules, recomputed on change and shown in the issues panel. */
export function validateBuild(model) {
  const issues = [];

  for (const element of model.catalog.required()) {
    const count = model.pieces().filter((p) => p.type === element.id).length;
    if (count === 0) {
      issues.push({
        level: 'error',
        code: 'missing-required',
        message: `A ${element.name} is required in every construction.`
      });
    }
  }

  // An edit can strand work, by taking away the support under it. Flag it and
  // let the user decide; never delete it for them.
  for (const piece of model.pieces()) {
    const result = canPlace(model, piece, { ignoreId: piece.id });
    if (result.ok) continue;
    for (const reason of result.reasons) {
      if (reason === REASON.DUPLICATE) continue;
      issues.push({
        level: 'warning',
        code: reason,
        pieceId: piece.id,
        message: `${model.catalog.get(piece.type).name}: ${REASON_TEXT[reason].toLowerCase()}.`
      });
    }
  }

  return issues;
}

/** Element counts and total material cost, with placeholder costs flagged. */
export function tally(model) {
  const rows = new Map();
  for (const piece of model.pieces()) {
    const element = model.catalog.get(piece.type);
    const row = rows.get(element.id) ?? {
      id: element.id, name: element.name, count: 0,
      unitCost: element.cost ?? 0, cost: 0,
      placeholder: Boolean(element.costPlaceholder)
    };
    row.count += 1;
    row.cost = row.count * row.unitCost;
    rows.set(element.id, row);
  }
  const list = [...rows.values()];
  return {
    rows: list,
    total: list.reduce((sum, r) => sum + r.cost, 0),
    hasPlaceholders: list.some((r) => r.placeholder)
  };
}
