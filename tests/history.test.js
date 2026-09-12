import { describe, it, expect } from 'vitest';
import { History } from '../src/model/history.js';
import { addPiece, deletePieces, movePieces, rotatePiece } from '../src/model/commands.js';
import { modelWithFob } from './helpers.js';

describe('undo and redo', () => {
  it('reverses a placement and puts it back', () => {
    const { model } = modelWithFob();
    const history = new History();
    history.run(addPiece(model, { type: 'hesco_block_small', x: 10, y: 10, z: 0 }));
    expect(model.count).toBe(2);
    history.undo();
    expect(model.count).toBe(1);
    history.redo();
    expect(model.count).toBe(2);
  });

  it('restores deleted pieces with their original ids and positions', () => {
    const { model } = modelWithFob();
    const history = new History();
    const block = model.addPiece({ type: 'hesco_block_small', x: 10, y: 10, z: 0 });
    history.run(deletePieces(model, [block.id]));
    expect(model.piece(block.id)).toBeNull();
    history.undo();
    expect(model.piece(block.id)).toMatchObject({ x: 10, y: 10, z: 0 });
  });

  it('treats a whole drag as one undo step', () => {
    const { model } = modelWithFob();
    const history = new History();
    const a = model.addPiece({ type: 'hesco_block_small', x: 10, y: 10, z: 0 });
    const b = model.addPiece({ type: 'hesco_block_small', x: 11, y: 10, z: 0 });
    history.run(movePieces(model, [
      { id: a.id, x: 20, y: 20, z: 0 },
      { id: b.id, x: 21, y: 20, z: 0 }
    ]));
    expect(model.piece(a.id).x).toBe(20);
    history.undo();
    expect(model.piece(a.id).x).toBe(10);
    expect(model.piece(b.id).x).toBe(11);
  });

  it('keeps the occupancy index in step through undo', () => {
    const { model } = modelWithFob();
    const history = new History();
    const block = model.addPiece({ type: 'hesco_block_small', x: 10, y: 10, z: 0 });
    history.run(movePieces(model, [{ id: block.id, x: 20, y: 20, z: 0 }]));
    expect(model.occupancy.at(10, 10, 0)).toBeNull();
    history.undo();
    expect(model.occupancy.at(10, 10, 0)).toBe(block.id);
    expect(model.occupancy.at(20, 20, 0)).toBeNull();
  });

  it('rotates and unrotates', () => {
    const { model } = modelWithFob();
    const history = new History();
    const wall = model.addPiece({ type: 'hesco_wall', x: 10, y: 10, z: 0 });
    history.run(rotatePiece(model, wall.id, 90));
    expect(model.occupancy.at(10, 13, 0)).toBe(wall.id);
    history.undo();
    expect(model.occupancy.at(13, 10, 0)).toBe(wall.id);
    expect(model.occupancy.at(10, 13, 0)).toBeNull();
  });

  it('drops the redo stack once a new command runs', () => {
    const { model } = modelWithFob();
    const history = new History();
    history.run(addPiece(model, { type: 'hesco_block_small', x: 10, y: 10, z: 0 }));
    history.undo();
    expect(history.canRedo).toBe(true);
    history.run(addPiece(model, { type: 'hesco_block_small', x: 11, y: 10, z: 0 }));
    expect(history.canRedo).toBe(false);
  });

  it('caps its depth', () => {
    const { model } = modelWithFob();
    const history = new History({ limit: 3 });
    for (let x = 10; x < 20; x++) {
      history.run(addPiece(model, { type: 'hesco_block_small', x, y: 10, z: 0 }));
    }
    let undone = 0;
    while (history.undo()) undone++;
    expect(undone).toBe(3);
  });
});
