import { describe, it, expect } from 'vitest';
import { toDocument, toJSON, fromJSON, fromDocument } from '../src/model/serialize.js';
import { modelWithFob, emptyModel } from './helpers.js';

describe('save and load', () => {
  it('round-trips a build', () => {
    const { model } = modelWithFob();
    model.setName('Outpost');
    model.addPiece({ type: 'hesco_wall_long', x: 10, y: 10, z: 0, rot: 90 });
    const json = toJSON(model);

    const loaded = emptyModel();
    fromJSON(loaded, json);
    expect(loaded.name).toBe('Outpost');
    expect(loaded.count).toBe(2);
    expect(toDocument(loaded)).toEqual(toDocument(model));
  });

  it('rebuilds the occupancy index on load', () => {
    const { model } = modelWithFob();
    const wall = model.addPiece({ type: 'hesco_wall_long', x: 10, y: 10, z: 0 });
    const loaded = emptyModel();
    fromJSON(loaded, toJSON(model));
    expect(loaded.occupancy.at(13, 10, 1)).toBe(wall.id);
  });

  it('keeps generated ids clear of loaded ones', () => {
    const { model } = modelWithFob();
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    const loaded = emptyModel();
    fromJSON(loaded, toJSON(model));
    const fresh = loaded.addPiece({ type: 'hesco_block', x: 20, y: 20, z: 0 });
    expect(loaded.piece(fresh.id)).not.toBeNull();
    expect(loaded.count).toBe(3);
  });

  it('refuses a document from a newer schema instead of mangling it', () => {
    const model = emptyModel();
    expect(() => fromDocument(model, { schema: 99, pieces: [] }))
      .toThrow(/newer version/);
  });

  it('names the unknown elements when a build cannot be read', () => {
    const model = emptyModel();
    const doc = { schema: 1, grid: model.grid, pieces: [{ id: 'p1', type: 'watchtower', x: 0, y: 0, z: 0, rot: 0 }] };
    expect(() => fromDocument(model, doc)).toThrow(/watchtower/);
  });
});
