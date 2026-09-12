/**
 * The element palette, built from the catalog. Elements the build cannot accept
 * any more of, such as a second FOB, are dimmed rather than hidden, so the
 * limit is visible instead of mysterious.
 */
import { coalesce } from './coalesce.js';

export class Palette {
  #root;
  #model;
  #onSelect;
  #selectedId = null;

  constructor(root, { model, onSelect }) {
    this.#root = root;
    this.#model = model;
    this.#onSelect = onSelect;
    this.#root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-element]');
      if (!button || button.disabled) return;
      this.select(button.dataset.element);
    });
    model.on('change', coalesce(() => this.render()));
    this.render();
  }

  get selectedId() {
    return this.#selectedId;
  }

  select(id) {
    this.#selectedId = id;
    this.render();
    this.#onSelect?.(id);
  }

  #atLimit(element) {
    if (element.maxCount == null) return false;
    return this.#model.pieces().filter((p) => p.type === element.id).length >= element.maxCount;
  }

  render() {
    // Placing the last FOB should not leave the palette pointing at something
    // that can no longer be placed.
    if (this.#selectedId && this.#atLimit(this.#model.catalog.get(this.#selectedId))) {
      const next = this.#model.catalog.elements.find((e) => !this.#atLimit(e));
      if (next) {
        this.#selectedId = next.id;
        queueMicrotask(() => this.#onSelect?.(next.id));
      }
    }

    const groups = this.#model.catalog.byCategory().filter((g) => g.elements.length);
    this.#root.innerHTML = groups.map((group) => `
      <div class="palette__group">
        <div class="label palette__group-name">${group.name}</div>
        <ul class="palette__list">
          ${group.elements.map((element) => this.#renderElement(element)).join('')}
        </ul>
      </div>
    `).join('');
  }

  #renderElement(element) {
    const [w, d, h] = element.size;
    const limited = this.#atLimit(element);
    const classes = [
      'element',
      element.id === this.#selectedId ? 'is-selected' : '',
      limited ? 'is-unavailable' : ''
    ].filter(Boolean).join(' ');

    return `
      <li>
        <button type="button" class="${classes}" data-element="${element.id}"
          ${limited ? 'disabled aria-disabled="true"' : ''}
          title="${element.notes ?? element.name}">
          <span class="element__swatch" style="--swatch: ${element.color}"></span>
          <span>
            <span class="element__name">${element.name}</span><br />
            <span class="element__meta mono">${w}×${d}×${h} m</span>
          </span>
          <span class="element__cost mono">${element.cost}</span>
        </button>
      </li>
    `;
  }
}
