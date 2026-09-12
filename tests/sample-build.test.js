import { describe, it, expect } from 'vitest';
import { BuildModel } from '../src/model/build.js';
import { catalog } from '../src/model/catalog.js';
import { validateBuild, tally } from '../src/model/validate.js';
import { seedSampleBuild } from '../src/sample-build.js';

describe('the sample build', () => {
  it('places without a single validation issue', () => {
    const model = new BuildModel({ catalog });
    seedSampleBuild(model);
    expect(validateBuild(model)).toEqual([]);
  });

  it('has an Air Defense resting on the bunker roof', () => {
    const model = new BuildModel({ catalog });
    seedSampleBuild(model);
    const ad = model.pieces().find((p) => p.type === 'air_defense');
    expect(ad.z).toBe(4);
  });

  it('reports a material cost', () => {
    const model = new BuildModel({ catalog });
    seedSampleBuild(model);
    expect(tally(model).total).toBeGreaterThan(0);
  });
});
