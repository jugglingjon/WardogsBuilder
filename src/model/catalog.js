/**
 * The element catalog. Everything about a building element is data in
 * data/elements.json, so adding or correcting a part is an edit to that file
 * rather than a code change.
 */
import catalogData from '../../data/elements.json';

export class Catalog {
  constructor(data = catalogData) {
    this.raw = data;
    this.cellSize = data.cellSize ?? 1;
    this.costUnits = data.costUnits ?? 'building material';
    this.categories = data.categories ?? [];
    this.elements = data.elements ?? [];
    this.byId = new Map(this.elements.map((e) => [e.id, e]));
    this.#validate();
  }

  get(id) {
    const element = this.byId.get(id);
    if (!element) throw new Error(`Unknown element type: ${id}`);
    return element;
  }

  has(id) {
    return this.byId.has(id);
  }

  /** Elements grouped for the palette, in catalog order within each category. */
  byCategory() {
    return this.categories.map((category) => ({
      ...category,
      elements: this.elements.filter((e) => e.category === category.id)
    }));
  }

  /** Elements flagged required, which drive build-level validation. */
  required() {
    return this.elements.filter((e) => e.required);
  }

  /** The element that defines the buildable region, if any. */
  regionDefiningElement() {
    return this.elements.find((e) => e.buildRegion) ?? null;
  }

  #validate() {
    for (const e of this.elements) {
      if (!Array.isArray(e.size) || e.size.length !== 3 ||
          e.size.some((n) => !Number.isInteger(n) || n < 1)) {
        throw new Error(`Element ${e.id} must declare an integer [w, d, h] size of at least 1`);
      }
      if (e.composedOf && !this.byId.has(e.composedOf.element)) {
        throw new Error(`Element ${e.id} is composed of unknown element ${e.composedOf.element}`);
      }
    }
  }
}

export const catalog = new Catalog();
