/**
 * Undo and redo over the command stack. Capped so a long session cannot grow
 * memory without bound.
 */
import { Emitter } from './events.js';

export class History extends Emitter {
  #past = [];
  #future = [];

  constructor({ limit = 200 } = {}) {
    super();
    this.limit = limit;
  }

  run(command) {
    const result = command.do();
    this.#past.push(command);
    if (this.#past.length > this.limit) this.#past.shift();
    this.#future.length = 0;
    this.#changed();
    return result;
  }

  undo() {
    const command = this.#past.pop();
    if (!command) return false;
    command.undo();
    this.#future.push(command);
    this.#changed();
    return true;
  }

  redo() {
    const command = this.#future.pop();
    if (!command) return false;
    command.do();
    this.#past.push(command);
    this.#changed();
    return true;
  }

  get canUndo() { return this.#past.length > 0; }
  get canRedo() { return this.#future.length > 0; }
  get undoLabel() { return this.#past.at(-1)?.label ?? null; }
  get redoLabel() { return this.#future.at(-1)?.label ?? null; }

  clear() {
    this.#past.length = 0;
    this.#future.length = 0;
    this.#changed();
  }

  #changed() {
    this.emit('change', {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.undoLabel,
      redoLabel: this.redoLabel
    });
  }
}
