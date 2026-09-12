/**
 * Top bar: build name, tools, undo and redo, and the plan overview toggle.
 */
export class Toolbar {
  #model;
  #history;
  #onTool;
  #tool = 'place';

  constructor(root, { model, history, onTool, onTogglePlan, onBuilds, onShare, onImage }) {
    this.#model = model;
    this.#history = history;
    this.#onTool = onTool;

    root.innerHTML = `
      <div class="toolbar__brand">
        <h1>Wardogs Builder</h1>
      </div>
      <div class="toolbar__group">
        <label class="visually-hidden" for="build-name">Build name</label>
        <input class="field" id="build-name" type="text" spellcheck="false" />
      </div>
      <div class="toolbar__group" role="group" aria-label="Tools">
        <button class="btn" data-tool="select" title="Select and move (V)">Select</button>
        <button class="btn" data-tool="place" title="Place (B)">Place</button>
        <button class="btn" data-tool="erase" title="Erase (E)">Erase</button>
      </div>
      <div class="toolbar__group">
        <button class="btn" data-action="undo">Undo</button>
        <button class="btn" data-action="redo">Redo</button>
      </div>
      <div class="toolbar__spacer"></div>
      <div class="toolbar__group">
        <button class="btn" data-action="builds" title="Save, open, import or export">Builds</button>
        <button class="btn" data-action="share" title="Copy a link to this build">Share</button>
        <button class="btn" data-action="image" title="Save the view as a PNG">Image</button>
        <button class="btn" data-action="plan" title="Show the plan overview">Plan</button>
        <button class="btn" id="help" title="Keyboard and mouse (?)" aria-label="Shortcuts">?</button>
      </div>
    `;

    this.nameField = root.querySelector('#build-name');
    this.undoButton = root.querySelector('[data-action="undo"]');
    this.redoButton = root.querySelector('[data-action="redo"]');
    this.planButton = root.querySelector('[data-action="plan"]');
    this.toolButtons = [...root.querySelectorAll('[data-tool]')];

    this.nameField.value = model.name;
    this.nameField.addEventListener('input', () => model.setName(this.nameField.value));
    this.undoButton.addEventListener('click', () => history.undo());
    this.redoButton.addEventListener('click', () => history.redo());
    this.planButton.addEventListener('click', () => {
      this.planButton.classList.toggle('is-active', onTogglePlan?.());
    });
    for (const button of this.toolButtons) {
      button.addEventListener('click', () => this.#onTool?.(button.dataset.tool));
    }
    root.querySelector('[data-action="builds"]').addEventListener('click', () => onBuilds?.());
    root.querySelector('[data-action="share"]').addEventListener('click', () => onShare?.());
    root.querySelector('[data-action="image"]').addEventListener('click', () => onImage?.());

    model.on('reset', () => { this.nameField.value = model.name; this.render(); });
    model.on('change', ({ reason }) => {
      if (reason === 'name' && this.nameField.value !== model.name) this.nameField.value = model.name;
    });
    history.on('change', () => this.render());
    this.render();
  }

  /** Reflect the tool the editor settled on, however it was chosen. */
  setTool(tool) {
    this.#tool = tool;
    this.render();
  }

  setPlanVisible(visible) {
    this.planButton.classList.toggle('is-active', visible);
  }

  render() {
    for (const button of this.toolButtons) {
      button.classList.toggle('is-active', button.dataset.tool === this.#tool);
    }
    this.undoButton.disabled = !this.#history.canUndo;
    this.redoButton.disabled = !this.#history.canRedo;
    this.undoButton.title = this.#history.undoLabel ?? 'Nothing to undo';
    this.redoButton.title = this.#history.redoLabel ?? 'Nothing to redo';
  }
}
