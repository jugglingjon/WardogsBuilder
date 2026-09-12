/**
 * Top bar: build name, undo and redo, and the elevation slice selector.
 *
 * Slices, not floors: elements have real metre heights and stack, so the left
 * pane edits one 1 m slice at a time. Ground level is z = 0.
 */
export class Toolbar {
  #model;
  #history;

  constructor(root, { model, history }) {
    this.#model = model;
    this.#history = history;
    root.innerHTML = `
      <div class="toolbar__brand">
        <h1>Wardogs Builder</h1>
        <span class="label">Planner</span>
      </div>
      <div class="toolbar__group">
        <label class="visually-hidden" for="build-name">Build name</label>
        <input class="field" id="build-name" type="text" spellcheck="false" />
      </div>
      <div class="toolbar__group">
        <button class="btn" data-action="undo">Undo</button>
        <button class="btn" data-action="redo">Redo</button>
      </div>
      <div class="toolbar__spacer"></div>
      <div class="toolbar__group">
        <span class="label">Elevation</span>
        <div class="slice">
          <button class="slice__step" data-action="slice-down" aria-label="Lower slice">−</button>
          <span class="slice__value mono" data-slice-value></span>
          <button class="slice__step" data-action="slice-up" aria-label="Raise slice">+</button>
        </div>
      </div>
    `;

    this.nameField = root.querySelector('#build-name');
    this.sliceValue = root.querySelector('[data-slice-value]');
    this.undoButton = root.querySelector('[data-action="undo"]');
    this.redoButton = root.querySelector('[data-action="redo"]');
    this.sliceDown = root.querySelector('[data-action="slice-down"]');
    this.sliceUp = root.querySelector('[data-action="slice-up"]');

    this.nameField.value = model.name;
    this.nameField.addEventListener('input', () => model.setName(this.nameField.value));
    this.undoButton.addEventListener('click', () => history.undo());
    this.redoButton.addEventListener('click', () => history.redo());
    this.sliceDown.addEventListener('click', () => model.setSlice(model.slice - 1));
    this.sliceUp.addEventListener('click', () => model.setSlice(model.slice + 1));

    model.on('slice:change', () => this.render());
    model.on('reset', () => { this.nameField.value = model.name; this.render(); });
    history.on('change', () => this.render());
    this.render();
  }

  render() {
    const { slice, grid } = this.#model;
    this.sliceValue.innerHTML = `<b>${slice}</b> / ${grid.height - 1} m`;
    this.sliceDown.disabled = slice <= 0;
    this.sliceUp.disabled = slice >= grid.height - 1;

    this.undoButton.disabled = !this.#history.canUndo;
    this.redoButton.disabled = !this.#history.canRedo;
    this.undoButton.title = this.#history.undoLabel ?? 'Nothing to undo';
    this.redoButton.title = this.#history.redoLabel ?? 'Nothing to redo';
  }
}
