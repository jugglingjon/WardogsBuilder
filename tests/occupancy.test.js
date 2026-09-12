import { describe, it, expect } from 'vitest';
import { Occupancy } from '../src/model/occupancy.js';

const block = { size: [1, 1, 1] };
const bunker = { size: [4, 4, 4] };

describe('occupancy index', () => {
  it('records one entry per cubic metre', () => {
    const index = new Occupancy();
    index.add({ id: 'a', x: 0, y: 0, z: 0, rot: 0 }, bunker);
    expect(index.size).toBe(64);
  });

  it('is patched, not rebuilt, on removal', () => {
    const index = new Occupancy();
    const piece = { id: 'a', x: 1, y: 1, z: 0, rot: 0 };
    index.add(piece, block);
    expect(index.at(1, 1, 0)).toBe('a');
    index.remove(piece, block);
    expect(index.at(1, 1, 0)).toBeNull();
    expect(index.size).toBe(0);
  });

  it('reports the resting height of a column', () => {
    const index = new Occupancy();
    expect(index.surfaceZ(0, 0, 16)).toBe(0);
    index.add({ id: 'a', x: 0, y: 0, z: 0, rot: 0 }, { size: [1, 1, 2] });
    expect(index.surfaceZ(0, 0, 16)).toBe(2);
  });
});
