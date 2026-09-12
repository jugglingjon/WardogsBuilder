import { describe, it, expect } from 'vitest';
import { canPlaceAll, dropZ, REASON_TEXT } from '../src/model/validate.js';
import { modelWithFob } from './helpers.js';

describe('pasting a group of stacks onto clear ground', () => {
  it('lands the whole group', () => {
    const { model } = modelWithFob();
    const clipboard = [];
    for (const [dx, dy] of [[0, 0], [13, 0], [0, 11], [13, 11]]) {
      clipboard.push({ type: 'hesco_block_large', rot: 0, dx, dy, dz: 0 });
      clipboard.push({ type: 'hesco_block_small', rot: 0, dx, dy, dz: 2 });
    }
    const anchor = { x: 20, y: 20 };

    let baseZ = 0;
    for (const e of clipboard) {
      const footprint = { type: e.type, rot: e.rot, x: anchor.x + e.dx, y: anchor.y + e.dy };
      baseZ = Math.max(baseZ, dropZ(model, footprint) - e.dz);
    }
    expect(baseZ).toBe(0);

    const specs = clipboard.map((e) => ({
      type: e.type, rot: e.rot,
      x: anchor.x + e.dx, y: anchor.y + e.dy, z: baseZ + e.dz
    }));
    const result = canPlaceAll(model, specs);
    expect(result.reasons.map((r) => REASON_TEXT[r])).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
