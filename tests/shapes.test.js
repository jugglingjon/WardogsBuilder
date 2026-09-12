import { describe, it, expect } from 'vitest';
import { SHAPES } from '../src/three/mesh-factory.js';
import { catalog } from '../src/model/catalog.js';

describe('every element can be drawn', () => {
  it('names a shape the factory knows', () => {
    const known = Object.keys(SHAPES);
    const missing = catalog.elements
      .filter((element) => !known.includes(element.shape))
      .map((element) => `${element.id} wants "${element.shape}"`);

    // Without this, a shape deleted by accident silently became a plain block.
    expect(missing).toEqual([]);
  });

  it('covers the shapes the catalog actually uses', () => {
    const used = new Set(catalog.elements.map((element) => element.shape));
    expect([...used].sort()).toEqual(
      ['block', 'blockhouse', 'cylinder', 'doorway', 'hedgehog', 'mound', 'spiral', 'tower']
    );
  });
});
