/**
 * The section cut: a toggle and a height, sitting with the view it affects.
 *
 * Elevation used to be an editing mode. Now that building happens in 3D it is
 * purely a way of looking: cut the view off at this height to see inside.
 */
export class CutControl {
  constructor(root, { model, view }) {
    this.model = model;
    this.view = view;
    root.innerHTML = `
      <button class="btn" data-action="clip" title="Cut the view off at this height">Clip</button>
      <div class="slice">
        <button class="slice__step" data-action="down" aria-label="Lower the cut">−</button>
        <span class="slice__value mono" data-value></span>
        <button class="slice__step" data-action="up" aria-label="Raise the cut">+</button>
      </div>
    `;
    this.clipButton = root.querySelector('[data-action="clip"]');
    this.value = root.querySelector('[data-value]');
    this.down = root.querySelector('[data-action="down"]');
    this.up = root.querySelector('[data-action="up"]');

    this.clipButton.addEventListener('click', () => this.#setClip(!view.clipping));
    this.down.addEventListener('click', () => this.#step(-1));
    this.up.addEventListener('click', () => this.#step(1));
    model.on('slice:change', () => this.render());
    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.key === 'PageUp') { event.preventDefault(); this.#step(1); }
      if (event.key === 'PageDown') { event.preventDefault(); this.#step(-1); }
    });
    this.render();
  }

  /** Nudging the height turns the cut on, since that is plainly the intent. */
  #step(delta) {
    this.model.setSlice(this.model.slice + delta);
    if (!this.view.clipping) this.#setClip(true);
  }

  #setClip(enabled) {
    this.view.setClip(enabled);
    this.render();
  }

  render() {
    this.clipButton.classList.toggle('is-active', this.view.clipping);
    this.value.innerHTML = `<b>${this.model.slice + 1}</b> m`;
    this.down.disabled = this.model.slice <= 0;
    this.up.disabled = this.model.slice >= this.model.grid.height - 1;
  }
}
