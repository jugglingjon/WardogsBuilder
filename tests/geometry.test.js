import { describe, it, expect } from 'vitest';
import {
  rotatedSize, boundsOf, cellsOf, baseCellsOf, topOf,
  normalizeRotation, gridToWorld, pieceCenterWorld
} from '../src/model/geometry.js';

const wall = { size: [4, 1, 2] };
const bunker = { size: [4, 4, 4] };

describe('rotation', () => {
  it('swaps width and depth at 90 and 270 only', () => {
    expect(rotatedSize(wall.size, 0)).toEqual([4, 1, 2]);
    expect(rotatedSize(wall.size, 90)).toEqual([1, 4, 2]);
    expect(rotatedSize(wall.size, 180)).toEqual([4, 1, 2]);
    expect(rotatedSize(wall.size, 270)).toEqual([1, 4, 2]);
  });

  it('never changes height', () => {
    for (const rot of [0, 90, 180, 270]) {
      expect(rotatedSize(wall.size, rot)[2]).toBe(2);
    }
  });

  it('normalises out-of-range and negative angles', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
  });
});

describe('occupied cells', () => {
  it('fills width x depth x height cells', () => {
    expect([...cellsOf({ x: 0, y: 0, z: 0, rot: 0 }, bunker)]).toHaveLength(64);
    expect([...cellsOf({ x: 0, y: 0, z: 0, rot: 0 }, wall)]).toHaveLength(8);
  });

  it('anchors the piece at its minimum corner', () => {
    const b = boundsOf({ x: 10, y: 10, z: 0, rot: 0 }, bunker);
    expect([b.x0, b.x1, b.y0, b.y1, b.z0, b.z1]).toEqual([10, 14, 10, 14, 0, 4]);
  });

  it('reports only the base footprint for support tests', () => {
    const base = [...baseCellsOf({ x: 0, y: 0, z: 3, rot: 0 }, bunker)];
    expect(base).toHaveLength(16);
    expect(base.every(([, , z]) => z === 3)).toBe(true);
  });

  it('puts the top face one metre above a 1m block', () => {
    expect(topOf({ x: 0, y: 0, z: 0, rot: 0 }, { size: [1, 1, 1] })).toBe(1);
    expect(topOf({ x: 0, y: 0, z: 0, rot: 0 }, bunker)).toBe(4);
  });
});

describe('world mapping', () => {
  it('maps grid height onto the three.js Y axis', () => {
    expect(gridToWorld(1, 2, 3)).toEqual({ x: 1, y: 3, z: 2 });
  });

  it('centres a box mesh on its occupied volume', () => {
    expect(pieceCenterWorld({ x: 0, y: 0, z: 0, rot: 0 }, bunker))
      .toEqual({ x: 2, y: 2, z: 2 });
  });
});
