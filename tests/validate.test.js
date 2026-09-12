import { describe, it, expect } from 'vitest';
import { canPlace, dropZ, restingZ, buildRegion, validateBuild, tally, REASON } from '../src/model/validate.js';
import { siteModel, modelWithFob, emptyModel, pad } from './helpers.js';
import { catalog } from '../src/model/catalog.js';

const place = (model, spec, opts) => canPlace(model, { id: 'ghost', rot: 0, ...spec }, opts);

describe('the site', () => {
  it('is exactly the buildable region, 50m out from the FOB', () => {
    const { model } = siteModel();
    expect(model.grid).toMatchObject({ width: 103, depth: 103 });
    expect(buildRegion(model)).toMatchObject({ x0: 0, y0: 0, x1: 103, y1: 103 });
  });

  it('starts with the FOB fixed at the centre', () => {
    const { model, fob } = siteModel();
    expect(fob).toMatchObject({ x: 50, y: 50, z: 0, rot: 0 });
    expect(model.pieces().filter((p) => p.type === 'fob')).toHaveLength(1);
  });

  it('rejects pieces outside the region', () => {
    const result = place(siteModel().model, { type: 'hesco_block', x: 103, y: 0, z: 0 });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(REASON.OUT_OF_REGION);
  });

  it('accepts pieces right up to the edge', () => {
    expect(place(siteModel().model, { type: 'hesco_block', x: 102, y: 102, z: 0 }).ok).toBe(true);
  });

  it('rejects a piece whose top passes the 16m limit', () => {
    expect(place(siteModel().model, { type: 'bunker', x: 10, y: 10, z: 13 }).reasons)
      .toContain(REASON.ABOVE_CEILING);
  });
});

describe('the FOB is a fixture', () => {
  it('cannot be placed, because the site already has one', () => {
    expect(place(siteModel().model, { type: 'fob', x: 10, y: 10, z: 0 }).reasons)
      .toContain(REASON.DUPLICATE);
  });

  it('cannot be moved', () => {
    const { model, fob } = siteModel();
    expect(model.updatePiece(fob.id, { x: 10, y: 10 })).toBeNull();
    expect(model.piece(fob.id)).toMatchObject({ x: 50, y: 50 });
  });

  it('cannot be deleted', () => {
    const { model, fob } = siteModel();
    expect(model.removePiece(fob.id)).toBeNull();
    expect(model.piece(fob.id)).not.toBeNull();
  });

  it('is free', () => {
    expect(catalog.get('fob').cost).toBe(0);
  });

  it('is kept out of the palette, since it cannot be placed', () => {
    expect(catalog.placeable().map((e) => e.id)).not.toContain('fob');
    expect(catalog.fixtures().map((e) => e.id)).toEqual(['fob']);
  });

  it('is not counted among the pieces the user placed', () => {
    const { model } = siteModel();
    expect(model.placedCount).toBe(0);
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    expect(model.placedCount).toBe(1);
    expect(model.count).toBe(2);
  });
});

describe('support', () => {
  it('accepts anything sitting on the ground', () => {
    const { model } = modelWithFob();
    expect(place(model, { type: 'bunker', x: 10, y: 10, z: 0 }).ok).toBe(true);
  });

  it('rejects a floating piece', () => {
    const { model } = modelWithFob();
    const result = place(model, { type: 'hesco_block', x: 10, y: 10, z: 3 });
    expect(result.reasons).toContain(REASON.UNSUPPORTED);
  });

  it('accepts a block stacked on a block', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    expect(place(model, { type: 'hesco_block', x: 10, y: 10, z: 1 }).ok).toBe(true);
  });

  it('requires every base cell to be supported, with no overhang', () => {
    const { model } = modelWithFob();
    // One block under a 4x1 wall leaves three cells hanging over air.
    model.addPiece({ type: 'hesco_block_tall', x: 10, y: 10, z: 0 });
    const result = place(model, { type: 'hesco_wall_long', x: 10, y: 10, z: 2 });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(REASON.UNSUPPORTED);
  });

  it('accepts a wall once every cell beneath it is supported', () => {
    const { model } = modelWithFob();
    pad(model, 'hesco_block_tall', 10, 10, 4, 1);
    expect(place(model, { type: 'hesco_wall_long', x: 10, y: 10, z: 2 }).ok).toBe(true);
  });

  it('refuses to stack on a FOB, which cannot support', () => {
    const { model, fob } = modelWithFob();
    const result = place(model, { type: 'hesco_block', x: fob.x, y: fob.y, z: 1 });
    expect(result.reasons).toContain(REASON.UNSUPPORTED);
  });

  it('refuses to stack on an Air Defense, which cannot support', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'air_defense', x: 20, y: 20, z: 0 });
    const result = place(model, { type: 'hesco_block', x: 20, y: 20, z: 1 });
    expect(result.reasons).toContain(REASON.UNSUPPORTED);
  });

  it('accepts an Air Defense on a Bunker roof', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'bunker', x: 20, y: 20, z: 0 });
    expect(place(model, { type: 'air_defense', x: 20, y: 20, z: 4 }).ok).toBe(true);
  });

  it('accepts an Air Defense on a full 3x3 of tall Hesco blocks', () => {
    const { model } = modelWithFob();
    pad(model, 'hesco_block_tall', 30, 30, 3, 3);
    expect(place(model, { type: 'air_defense', x: 30, y: 30, z: 2 }).ok).toBe(true);
  });

  it('rejects an Air Defense when one supporting column is missing', () => {
    const { model } = modelWithFob();
    pad(model, 'hesco_block_tall', 30, 30, 3, 3);
    model.removePiece(model.pieces().at(-1).id);
    const result = place(model, { type: 'air_defense', x: 30, y: 30, z: 2 });
    expect(result.reasons).toContain(REASON.UNSUPPORTED);
  });
});

describe('collision', () => {
  it('rejects an overlapping placement', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'bunker', x: 20, y: 20, z: 0 });
    const result = place(model, { type: 'hesco_block', x: 22, y: 22, z: 0 });
    expect(result.reasons).toContain(REASON.OCCUPIED);
  });

  it('ignores the piece being dragged, so nudging one cell works', () => {
    const { model } = modelWithFob();
    const block = model.addPiece({ type: 'hesco_wall_long', x: 20, y: 20, z: 0 });
    const moved = { ...block, x: 21 };
    expect(canPlace(model, moved, { ignoreId: block.id }).ok).toBe(true);
  });
});

describe('drop to support', () => {
  it('drops to the ground over empty columns', () => {
    const { model } = modelWithFob();
    expect(dropZ(model, { type: 'hesco_block', x: 10, y: 10, rot: 0 })).toBe(0);
  });

  it('rests on top of what is already there', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block_tall', x: 10, y: 10, z: 0 });
    expect(dropZ(model, { type: 'hesco_block', x: 10, y: 10, rot: 0 })).toBe(2);
  });

  it('rests on the highest column under a multi-cell footprint', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    model.addPiece({ type: 'hesco_block_tall', x: 12, y: 10, z: 0 });
    expect(dropZ(model, { type: 'hesco_wall_long', x: 10, y: 10, rot: 0 })).toBe(2);
  });

  it('accounts for rotation when scanning columns', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block_tall', x: 10, y: 13, z: 0 });
    expect(dropZ(model, { type: 'hesco_wall_long', x: 10, y: 10, rot: 0 })).toBe(0);
    expect(dropZ(model, { type: 'hesco_wall_long', x: 10, y: 10, rot: 90 })).toBe(2);
  });
});

describe('build-level rules', () => {
  it('never reports a missing FOB, because the site places it', () => {
    expect(validateBuild(emptyModel())).toEqual([]);
  });

  it('is clean for a valid build', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    expect(validateBuild(model)).toEqual([]);
  });

  it('flags a piece left unsupported by an edit, rather than deleting it', () => {
    const { model } = siteModel();
    const lower = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    const upper = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 1 });
    model.updatePiece(lower.id, { x: 20 });

    const issues = validateBuild(model);
    expect(issues.some((i) => i.pieceId === upper.id && i.code === REASON.UNSUPPORTED)).toBe(true);
    expect(model.piece(upper.id)).not.toBeNull();
  });
});

describe('material tally', () => {
  it('totals cost and flags placeholder values', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    model.addPiece({ type: 'hesco_block', x: 11, y: 10, z: 0 });
    const result = tally(model);
    expect(result.total).toBe(20); // the FOB is free
    expect(result.hasPlaceholders).toBe(false);
    expect(result.rows.find((r) => r.id === 'hesco_block')).toMatchObject({ count: 2, cost: 20 });
  });
});

describe('where a placed piece lands', () => {
  it('rests on top of a two metre stack from any slice', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block_tall', x: 30, y: 30, z: 0 });
    const ghost = { type: 'hesco_block', x: 30, y: 30, rot: 0 };
    expect(restingZ(model, ghost)).toBe(2);
    expect(place(model, { ...ghost, z: restingZ(model, ghost) }).ok).toBe(true);
  });

  it('lands an Air Defense on a 3x3 of tall blocks', () => {
    const { model } = modelWithFob();
    pad(model, 'hesco_block_tall', 30, 30, 3, 3);
    const ghost = { type: 'air_defense', x: 30, y: 30, rot: 0 };
    expect(restingZ(model, ghost)).toBe(2);
    expect(place(model, { ...ghost, z: restingZ(model, ghost) }).ok).toBe(true);
  });

  it('falls to the ground over clear columns, never floating at the slice', () => {
    const { model } = modelWithFob();
    model.setSlice(7);
    expect(restingZ(model, { type: 'hesco_block', x: 30, y: 30, rot: 0 })).toBe(0);
  });

  it('rests on the tallest column under a multi-cell footprint', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block', x: 40, y: 40, z: 0 });
    model.addPiece({ type: 'bunker', x: 41, y: 40, z: 0 });
    expect(restingZ(model, { type: 'hesco_wall_long', x: 40, y: 40, rot: 0 })).toBe(4);
  });
});
