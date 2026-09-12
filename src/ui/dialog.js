/**
 * A thin wrapper over the native dialog element, which already handles the
 * modal backdrop, focus trapping and closing on Escape.
 */
export class Dialog {
  #element;

  constructor() {
    this.#element = document.createElement('dialog');
    this.#element.className = 'dialog';
    document.body.append(this.#element);
    this.#element.addEventListener('click', (event) => {
      // A click on the backdrop lands on the dialog itself, never its contents.
      if (event.target === this.#element) this.close();
    });
  }

  open({ title, body, onMount }) {
    this.#element.innerHTML = `
      <form method="dialog" class="dialog__inner">
        <header class="dialog__header">
          <h2>${title}</h2>
          <button class="btn" value="close" aria-label="Close">Close</button>
        </header>
        <div class="dialog__body">${body}</div>
      </form>
    `;
    onMount?.(this.#element);
    this.#element.showModal();
    return this.#element;
  }

  close() {
    if (this.#element.open) this.#element.close();
  }

  get element() {
    return this.#element;
  }
}

/**
 * One dialog element for the whole app. Two would mean two modals able to open
 * over each other, and two copies of the same markup in the document.
 */
let shared = null;
export function sharedDialog() {
  return (shared ??= new Dialog());
}

/** A brief message that does not need acknowledging. */
export function toast(message, { level = 'info' } = {}) {
  let host = document.querySelector('#toast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast';
    document.body.append(host);
  }
  const note = document.createElement('div');
  note.className = `toast toast--${level}`;
  note.textContent = message;
  host.append(note);
  setTimeout(() => note.classList.add('is-leaving'), 2600);
  setTimeout(() => note.remove(), 3100);
}
