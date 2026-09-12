import { describe, it, expect, beforeEach } from 'vitest';
import { Storage } from '../src/model/storage.js';
import { encodeShare, decodeShare, shareUrl, readShare } from '../src/model/share.js';
import { toDocument, fromDocument } from '../src/model/serialize.js';
import { modelWithFob, emptyModel } from './helpers.js';

/** A localStorage stand-in, plus a broken one to prove failures are survivable. */
function fakeStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() { return map.size; }
  };
}

describe('local storage', () => {
  let store;
  let storage;
  beforeEach(() => {
    store = fakeStore();
    storage = new Storage(store);
  });

  it('round-trips the autosave slot', () => {
    const { model } = modelWithFob();
    expect(storage.autosave(toDocument(model))).toBe(true);
    const restored = storage.restore();
    expect(restored.pieces).toHaveLength(1);
  });

  it('has nothing to restore on a first visit', () => {
    expect(storage.restore()).toBeNull();
  });

  it('survives junk left in storage', () => {
    store.setItem('wardogs.autosave', 'not json');
    expect(storage.restore()).toBeNull();
  });

  it('reports rather than throws when storage refuses a write', () => {
    const full = { ...fakeStore(), setItem() { throw new Error('QuotaExceededError'); } };
    expect(new Storage(full).autosave({ pieces: [] })).toBe(false);
  });

  it('works with no storage at all', () => {
    const none = new Storage(null);
    expect(none.available).toBe(false);
    expect(none.restore()).toBeNull();
    expect(none.list()).toEqual([]);
  });

  it('keeps named saves, newest first', () => {
    const { model } = modelWithFob();
    storage.save('Alpha', toDocument(model));
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    storage.save('Bravo', toDocument(model));

    const list = storage.list();
    expect(list.map((e) => e.name)).toEqual(['Bravo', 'Alpha']);
    expect(list[0].pieces).toBe(2);
  });

  it('overwrites a save of the same name instead of duplicating it', () => {
    const { model } = modelWithFob();
    const first = storage.save('Outpost', toDocument(model));
    model.addPiece({ type: 'hesco_block', x: 10, y: 10, z: 0 });
    const second = storage.save('Outpost', toDocument(model));

    expect(second.id).toBe(first.id);
    expect(storage.list()).toHaveLength(1);
    expect(storage.load(first.id).pieces).toHaveLength(2);
  });

  it('refuses an empty name', () => {
    expect(storage.save('   ', { pieces: [] })).toBeNull();
  });

  it('deletes a save and forgets it', () => {
    const entry = storage.save('Gone', { pieces: [] });
    storage.remove(entry.id);
    expect(storage.list()).toEqual([]);
    expect(storage.load(entry.id)).toBeNull();
  });
});

describe('share links', () => {
  it('round-trips a build through the hash', async () => {
    const { model } = modelWithFob();
    model.setName('Shared outpost');
    model.addPiece({ type: 'hesco_wall_long', x: 20, y: 20, z: 0, rot: 90 });
    model.addPiece({ type: 'hesco_block', x: 20, y: 20, z: 2 });

    const decoded = await decodeShare(await encodeShare(toDocument(model)));
    const loaded = emptyModel();
    fromDocument(loaded, decoded);

    expect(loaded.name).toBe('Shared outpost');
    expect(loaded.count).toBe(3);
    expect(loaded.pieces().find((p) => p.type === 'hesco_wall_long'))
      .toMatchObject({ x: 20, y: 20, z: 0, rot: 90 });
  });

  it('compresses, so a big build still fits a link', async () => {
    const { model } = modelWithFob();
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 10; y++) model.addPiece({ type: 'hesco_block', x: 20 + x, y: 20 + y, z: 0 });
    }
    const doc = toDocument(model);
    const payload = await encodeShare(doc);
    expect(payload.length).toBeLessThan(JSON.stringify(doc).length / 4);
  });

  it('builds a url and reads it back', async () => {
    const { model } = modelWithFob();
    const url = await shareUrl(toDocument(model), 'https://example.com/builder/');
    expect(url).toContain('#b=');
    expect((await readShare(new URL(url).hash)).pieces).toHaveLength(1);
  });

  it('returns nothing for a hash with no build in it', async () => {
    expect(await readShare('#something-else')).toBeNull();
  });

  it('returns nothing rather than throwing on a mangled link', async () => {
    expect(await readShare('#b=notarealpayload')).toBeNull();
  });
});
