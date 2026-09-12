import { describe, it, expect } from 'vitest';
import { canMove, canPlaceAll, validateBuild, REASON } from '../src/model/validate.js';
import { boundsOfPieces } from '../src/model/query.js';
import { modelWithFob, pad } from './helpers.js';

describe('moving a selection', () => {
  it('nudges a single piece', () => {
    const { model } = modelWithFob();
    const block = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    expect(canMove(model, [block.id], { dx: 1 }).ok).toBe(true);
  });

  it('lets a stack move as one, keeping its own support', () => {
    const { model } = modelWithFob();
    const lower = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    const upper = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 1 });
    // The upper block is supported by the lower one, and both are moving.
    expect(canMove(model, [lower.id, upper.id], { dx: 3 }).ok).toBe(true);
  });

  it('allows moving a support away, and flags what it strands', () => {
    // Consistent with moving the FOB: the tool never silently deletes or blocks
    // work, it reports what the edit broke and lets the user decide.
    const { model } = modelWithFob();
    const lower = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    const upper = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 1 });
    expect(canMove(model, [lower.id], { dx: 3 }).ok).toBe(true);

    model.updatePiece(lower.id, { x: 13 });
    const issues = validateBuild(model);
    expect(issues.some((i) => i.pieceId === upper.id && i.code === REASON.UNSUPPORTED)).toBe(true);
  });

  it('refuses a move onto something already there', () => {
    const { model } = modelWithFob();
    const a = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    model.addPiece({ type: 'hesco_block', x: 11, y: 10, z: 0 });
    expect(canMove(model, [a.id], { dx: 1 }).reasons).toContain(REASON.OCCUPIED);
  });

  it('carries the build region with the FOB', () => {
    const { model, fob } = modelWithFob();
    const edge = model.addPiece({ type: 'hesco_block', x: 100, y: 50, z: 0 });
    // Moving the FOB away strands the far block, so the move is not clean.
    expect(canMove(model, [fob.id], { dx: -40 }).ok).toBe(true);
    // ...but moving both together is, because the region travels with them.
    expect(canMove(model, [fob.id, edge.id], { dx: -40 }).ok).toBe(true);
  });

  it('refuses to push a piece out of the region', () => {
    const { model } = modelWithFob();
    const block = model.addPiece({ type: 'hesco_block', x: 102, y: 50, z: 0 });
    expect(canMove(model, [block.id], { dx: 1 }).reasons).toContain(REASON.OUT_OF_REGION);
  });

  it('refuses to leave a piece floating', () => {
    const { model } = modelWithFob();
    pad(model, 'hesco_block', 10, 10, 2, 1);
    const top = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 1 });
    expect(canMove(model, [top.id], { dx: 5 }).reasons).toContain(REASON.UNSUPPORTED);
  });
});

describe('pasting', () => {
  it('accepts a group that fits', () => {
    const { model } = modelWithFob();
    expect(canPlaceAll(model, [
      { type: 'hesco_block', x: 20, y: 20, z: 0 },
      { type: 'hesco_block', x: 21, y: 20, z: 0 }
    ]).ok).toBe(true);
  });

  it('lets pasted pieces support each other', () => {
    const { model } = modelWithFob();
    expect(canPlaceAll(model, [
      { type: 'hesco_block', x: 20, y: 20, z: 0 },
      { type: 'hesco_block', x: 20, y: 20, z: 1 }
    ]).ok).toBe(true);
  });

  it('is all or nothing when one piece of the group collides', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block', x: 21, y: 20, z: 0 });
    expect(canPlaceAll(model, [
      { type: 'hesco_block', x: 20, y: 20, z: 0 },
      { type: 'hesco_block', x: 21, y: 20, z: 0 }
    ]).ok).toBe(false);
  });

  it('refuses a second FOB in the pasted group', () => {
    const { model } = modelWithFob();
    expect(canPlaceAll(model, [{ type: 'fob', x: 20, y: 20, z: 0 }]).reasons)
      .toContain(REASON.DUPLICATE);
  });
});

describe('selection geometry', () => {
  it('measures the box around a selection', () => {
    const { model } = modelWithFob();
    const a = model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    const b = model.addPiece({ type: 'bunker', x: 12, y: 12, z: 0 });
    expect(boundsOfPieces(model, [a.id, b.id]))
      .toMatchObject({ x0: 10, y0: 10, z0: 0, x1: 16, y1: 16, z1: 4 });
  });
});
