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

  it('has a Stingray resting on the bunker roof', () => {
    const model = new BuildModel({ catalog });
    seedSampleBuild(model);
    const stingray = model.pieces().find((p) => p.type === 'stingray');
    expect(stingray.z).toBe(2); // the bunker is two metres tall
  });

  it('reports a material cost', () => {
    const model = new BuildModel({ catalog });
    seedSampleBuild(model);
    expect(tally(model).total).toBeGreaterThan(0);
  });
});
