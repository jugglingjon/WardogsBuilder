/**
 * Placement and build rules.
 *
 * Placement rules are checked live while placing or moving, and report why they
 * failed so a rejected placement is never a mystery. Build rules are recomputed
 * on change and surfaced in the issues panel rather than blocking edits.
 */
import { boundsOf, baseCellsOf, cellsOf, rotatedSize } from './geometry.js';

export const REASON = {
  OUT_OF_GRID: 'out-of-grid',
  ABOVE_CEILING: 'above-ceiling',
  OUT_OF_REGION: 'out-of-region',
  OCCUPIED: 'occupied',
  UNSUPPORTED: 'unsupported',
  DUPLICATE: 'duplicate'
};

export const REASON_TEXT = {
  [REASON.OUT_OF_GRID]: 'Outside the grid',
  [REASON.ABOVE_CEILING]: 'Above the build height limit',
  [REASON.OUT_OF_REGION]: 'Outside the build region',
  [REASON.OCCUPIED]: 'Overlaps something already placed',
  [REASON.UNSUPPORTED]: 'Not fully supported',
  [REASON.DUPLICATE]: 'Only one of these is allowed'
};

/**
 * The buildable region: the region-defining element's footprint expanded by its
 * margin in every horizontal direction. Null when none is placed, in which case
 * the whole grid is available so the first one can go anywhere.
 */
export function buildRegion(model) {
  const defining = model.catalog.regionDefiningElement();
  if (!defining) return null;
  const piece = model.pieces().find((p) => p.type === defining.id);
  if (!piece) return null;

  const element = model.catalog.get(piece.type);
  const margin = element.buildRegion.marginFromFootprint ?? 0;
  const b = boundsOf(piece, element);
  return {
    x0: b.x0 - margin, x1: b.x1 + margin,
    y0: b.y0 - margin, y1: b.y1 + margin,
    definedBy: piece.id
  };
}

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
 * `ignoreId` excludes a piece from collision against itself, which is what
 * makes dragging a piece one cell work.
 */
export function canPlace(model, piece, { ignoreId = null } = {}) {
  const element = model.catalog.get(piece.type);
  const reasons = new Set();
  const b = boundsOf(piece, element);
  const grid = model.grid;

  if (b.x0 < 0 || b.y0 < 0 || b.z0 < 0 || b.x1 > grid.width || b.y1 > grid.depth) {
    reasons.add(REASON.OUT_OF_GRID);
  }
  if (b.z1 > grid.height) reasons.add(REASON.ABOVE_CEILING);

  // The region-defining element is exempt from the region, since it creates it.
  if (!element.buildRegion) {
    const region = buildRegion(model);
    if (region && (b.x0 < region.x0 || b.x1 > region.x1 ||
                   b.y0 < region.y0 || b.y1 > region.y1)) {
      reasons.add(REASON.OUT_OF_REGION);
    }
  }

  for (const [x, y, z] of cellsOf(piece, element)) {
    const occupantId = model.occupancy.at(x, y, z);
    if (occupantId && occupantId !== ignoreId && occupantId !== piece.id) {
      reasons.add(REASON.OCCUPIED);
      break;
    }
  }

  if (element.maxCount != null) {
    const existing = model.pieces()
      .filter((p) => p.type === piece.type && p.id !== piece.id && p.id !== ignoreId);
    if (existing.length >= element.maxCount) reasons.add(REASON.DUPLICATE);
  }

  if (!reasons.has(REASON.OCCUPIED) && !isSupportedAt(model, piece, element)) {
    reasons.add(REASON.UNSUPPORTED);
  }

  return { ok: reasons.size === 0, reasons: [...reasons] };
}

/**
 * The lowest z a piece can rest at in this column, so placing onto a slice
 * drops the piece onto whatever is beneath it rather than leaving it floating.
 */
export function dropZ(model, piece) {
  const element = model.catalog.get(piece.type);
  const [w, d] = rotatedSize(element.size, piece.rot);
  let z = 0;
  for (let y = piece.y; y < piece.y + d; y++) {
    for (let x = piece.x; x < piece.x + w; x++) {
      z = Math.max(z, model.occupancy.surfaceZ(x, y, model.grid.height));
    }
  }
  return z;
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

  // Moving or deleting the region-defining piece can strand work outside the
  // new region. Flag it and let the user decide; never delete it for them.
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
