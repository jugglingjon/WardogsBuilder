import { BuildModel, defaultGrid } from '../src/model/build.js';
import { catalog } from '../src/model/catalog.js';

/** A model with the FOB centred, so its region exactly fills the grid. */
export function modelWithFob() {
  const model = new BuildModel({ catalog, grid: defaultGrid(catalog) });
  const fob = model.addPiece({ type: 'fob', x: 50, y: 50, z: 0 });
  return { model, fob };
}

export function emptyModel() {
  return new BuildModel({ catalog, grid: defaultGrid(catalog) });
}

/** Fill a w x d patch of ground with blocks of the given type. */
export function pad(model, type, x0, y0, w, d, z = 0) {
  const placed = [];
  for (let y = y0; y < y0 + d; y++)
    for (let x = x0; x < x0 + w; x++)
      placed.push(model.addPiece({ type, x, y, z }));
  return placed;
}
