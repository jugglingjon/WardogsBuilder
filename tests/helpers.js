import { BuildModel, defaultGrid } from '../src/model/build.js';
import { catalog } from '../src/model/catalog.js';

/**
 * A model as the app makes one: the site is the buildable region and the FOB is
 * already fixed at its centre.
 */
export function siteModel() {
  const model = new BuildModel({ catalog, grid: defaultGrid(catalog) });
  const fob = model.pieces().find((p) => p.type === 'fob');
  return { model, fob };
}

/** Kept for the many tests that only need a model with its fixture in place. */
export const modelWithFob = siteModel;
export const emptyModel = () => siteModel().model;

/** Fill a w x d patch of ground with blocks of the given type. */
export function pad(model, type, x0, y0, w, d, z = 0) {
  const placed = [];
  for (let y = y0; y < y0 + d; y++)
    for (let x = x0; x < x0 + w; x++)
      placed.push(model.addPiece({ type, x, y, z }));
  return placed;
}
