/**
 * First-run hints. One at a time, in the view, gone once it has been acted on.
 *
 * A planner that opens onto empty ground with no instructions is a planner
 * nobody finishes their first build in.
 */
const SEEN_KEY = 'wardogs.hints.seen';

export class Hints {
  #dismissed = new Set();

  constructor(element, { model, view, storage = globalThis.localStorage }) {
    this.element = element;
    this.model = model;
    this.storage = storage;

    try {
      const seen = JSON.parse(this.storage?.getItem(SEEN_KEY) ?? '[]');
      if (Array.isArray(seen)) this.#dismissed = new Set(seen);
    } catch { /* a fresh start is the safe default */ }

    // Orbiting is the hint's own subject, so doing it is the acknowledgement.
    // Measured across the gesture, because a tap also starts the controls and
    // tapping is not the thing being taught.
    let before = null;
    view.controls.addEventListener('start', () => {
      before = view.camera.position.clone();
    });
    view.controls.addEventListener('end', () => {
      if (before && view.camera.position.distanceTo(before) > 0.5) this.dismiss('camera');
    });
    model.on('change', () => this.render());
    this.render();
  }

  dismiss(id) {
    if (this.#dismissed.has(id)) return;
    this.#dismissed.add(id);
    try {
      this.storage?.setItem(SEEN_KEY, JSON.stringify([...this.#dismissed]));
    } catch { /* the hint simply comes back next time */ }
    this.render();
  }

  #current() {
    if (this.model.placedCount === 0) {
      return {
        id: 'start',
        title: 'Pick an element and click to build',
        detail: 'The FOB sits at the centre and the ground reaches 50 m from it.'
      };
    }
    if (!this.#dismissed.has('camera')) {
      const touch = globalThis.matchMedia?.('(pointer: coarse)').matches;
      return touch
        ? {
            id: 'camera',
            title: 'Drag to look around',
            detail: 'Pinch to zoom, two fingers to pan. Tap to place a piece.'
          }
        : {
            id: 'camera',
            title: 'Right-drag to orbit',
            detail: 'Scroll to zoom, middle-drag to pan. Press ? for every shortcut.'
          };
    }
    return null;
  }

  render() {
    const hint = this.#current();
    this.element.hidden = !hint;
    if (!hint) return;
    this.element.innerHTML = `<strong>${hint.title}</strong><span>${hint.detail}</span>`;
  }
}
