/**
 * Save format. Every document carries its schema version so an old file is
 * migrated rather than rejected.
 */
import { SCHEMA_VERSION } from './build.js';

export function toDocument(model) {
  return {
    schema: SCHEMA_VERSION,
    name: model.name,
    grid: { ...model.grid },
    pieces: model.pieces().map(({ id, type, x, y, z, rot }) => ({ id, type, x, y, z, rot }))
  };
}

export function toJSON(model, { pretty = true } = {}) {
  return JSON.stringify(toDocument(model), null, pretty ? 2 : 0);
}

/** Migrations run in order, each taking a document one version forward. */
const MIGRATIONS = {};

export function migrate(doc) {
  let current = { ...doc };
  let version = current.schema ?? 1;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from schema ${version}`);
    current = step(current);
    version = current.schema;
  }
  return current;
}

export function fromDocument(model, doc) {
  if (!doc || typeof doc !== 'object') throw new Error('Not a build document');
  if ((doc.schema ?? 0) > SCHEMA_VERSION) {
    throw new Error(`This build was saved by a newer version of the tool (schema ${doc.schema})`);
  }
  const migrated = migrate(doc);

  const unknown = (migrated.pieces ?? [])
    .map((p) => p.type)
    .filter((type) => !model.catalog.has(type));
  if (unknown.length) {
    throw new Error(`Build uses unknown elements: ${[...new Set(unknown)].join(', ')}`);
  }

  model.reset({
    grid: migrated.grid,
    name: migrated.name,
    pieces: migrated.pieces ?? []
  });
  return model;
}

export function fromJSON(model, text) {
  return fromDocument(model, JSON.parse(text));
}
