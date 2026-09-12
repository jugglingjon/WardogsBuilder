import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  screenBoundsOfPiece, piecesInScreenRect, normalizeScreenRect, rectsOverlap
} from '../src/three/screen-select.js';
import { modelWithFob } from './helpers.js';

const VIEWPORT = { width: 1000, height: 800 };

/** A camera looking straight down, so screen space maps predictably to the grid. */
function overheadCamera(target = { x: 50, y: 50 }, height = 60) {
  const camera = new THREE.PerspectiveCamera(50, VIEWPORT.width / VIEWPORT.height, 0.5, 500);
  camera.position.set(target.x, height, target.y);
  camera.up.set(0, 0, -1);
  camera.lookAt(target.x, 0, target.y);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  return camera;
}

/** Where a grid cell lands on screen under that camera. */
function screenOf(camera, gx, gy) {
  const v = new THREE.Vector3(gx, 0, gy).project(camera);
  return { x: (v.x + 1) / 2 * VIEWPORT.width, y: (-v.y + 1) / 2 * VIEWPORT.height };
}

describe('rectangles', () => {
  it('normalises a drag made in any direction', () => {
    expect(normalizeScreenRect({ x: 90, y: 10 }, { x: 20, y: 70 }))
      .toEqual({ x0: 20, y0: 10, x1: 90, y1: 70 });
  });

  it('counts edge contact as overlap', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 10, x1: 20, y1: 20 })).toBe(true);
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 11, y0: 0, x1: 20, y1: 10 })).toBe(false);
  });
});

describe('projecting a piece', () => {
  it('covers a rectangle on screen', () => {
    const { model } = modelWithFob();
    const camera = overheadCamera();
    const bounds = screenBoundsOfPiece(model.pieces()[0], model.catalog.get('fob'), camera, VIEWPORT);
    expect(bounds.x1).toBeGreaterThan(bounds.x0);
    expect(bounds.y1).toBeGreaterThan(bounds.y0);
  });

  it('grows with the piece', () => {
    const { model } = modelWithFob();
    const camera = overheadCamera();
    const block = model.addPiece({ type: 'hesco_block_small', x: 50, y: 50, z: 0 });
    const bunker = model.addPiece({ type: 'bunker', x: 60, y: 60, z: 0 });
    const small = screenBoundsOfPiece(block, model.elementOf(block), camera, VIEWPORT);
    const large = screenBoundsOfPiece(bunker, model.elementOf(bunker), camera, VIEWPORT);
    expect(large.x1 - large.x0).toBeGreaterThan(small.x1 - small.x0);
  });

  it('reports nothing for a piece behind the camera', () => {
    const { model } = modelWithFob();
    const camera = overheadCamera();
    const behind = model.addPiece({ type: 'hesco_block_small', x: 50, y: 50, z: 0 });
    camera.position.set(50, -40, 50); // underground, looking further down
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    expect(screenBoundsOfPiece(behind, model.elementOf(behind), camera, VIEWPORT)).toBeNull();
  });
});

describe('selecting with a rectangle', () => {
  it('catches the pieces inside it and leaves the rest', () => {
    const { model } = modelWithFob();
    const camera = overheadCamera();
    const near = model.addPiece({ type: 'hesco_block_small', x: 48, y: 48, z: 0 });
    const alsoNear = model.addPiece({ type: 'hesco_block_small', x: 49, y: 48, z: 0 });
    const far = model.addPiece({ type: 'hesco_block_small', x: 70, y: 70, z: 0 });

    const a = screenOf(camera, 47, 47);
    const b = screenOf(camera, 51, 50);
    const ids = piecesInScreenRect(model, camera, VIEWPORT, normalizeScreenRect(a, b));

    expect(ids).toContain(near.id);
    expect(ids).toContain(alsoNear.id);
    expect(ids).not.toContain(far.id);
  });

  it('selects a stack through its own roof, since occlusion is ignored', () => {
    const { model } = modelWithFob();
    const camera = overheadCamera();
    const lower = model.addPiece({ type: 'hesco_block_small', x: 48, y: 48, z: 0 });
    const upper = model.addPiece({ type: 'hesco_block_small', x: 48, y: 48, z: 1 });

    const rect = normalizeScreenRect(screenOf(camera, 47, 47), screenOf(camera, 50, 50));
    const ids = piecesInScreenRect(model, camera, VIEWPORT, rect);
    expect(ids).toContain(lower.id);
    expect(ids).toContain(upper.id);
  });

  it('returns nothing for a rectangle over bare ground', () => {
    const { model } = modelWithFob();
    const camera = overheadCamera();
    const rect = normalizeScreenRect(screenOf(camera, 20, 20), screenOf(camera, 24, 24));
    expect(piecesInScreenRect(model, camera, VIEWPORT, rect)).toEqual([]);
  });
});
