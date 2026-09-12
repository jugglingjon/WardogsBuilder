/**
 * Minimal synchronous event emitter.
 *
 * The 2D and 3D renderers both subscribe to BuildModel through this, and both
 * apply deltas rather than rebuilding, so events must be granular and must fire
 * after the model has already settled.
 */
export class Emitter {
  #listeners = new Map();

  on(type, fn) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.#listeners.get(type)?.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.#listeners.get(type) ?? []) fn(payload);
    for (const fn of this.#listeners.get('*') ?? []) fn({ type, payload });
  }
}
