/**
 * The rubber-band rectangle itself: a plain element over the canvas rather than
 * anything in the scene, so it stays crisp and costs no render.
 */
import { normalizeScreenRect } from './screen-select.js';

const THRESHOLD = 4; // px of travel before a click becomes a drag

export class Marquee {
  #from = null;
  #to = null;

  constructor(host) {
    this.element = document.createElement('div');
    this.element.className = 'marquee';
    this.element.hidden = true;
    host.append(this.element);
  }

  start(x, y) {
    this.#from = { x, y };
    this.#to = { x, y };
  }

  update(x, y) {
    if (!this.#from) return;
    this.#to = { x, y };
    const rect = this.rect();
    this.element.hidden = !this.active;
    this.element.style.transform = `translate(${rect.x0}px, ${rect.y0}px)`;
    this.element.style.width = `${rect.x1 - rect.x0}px`;
    this.element.style.height = `${rect.y1 - rect.y0}px`;
  }

  /** A drag only counts once it has travelled, so a click still clears. */
  get active() {
    if (!this.#from) return false;
    return Math.abs(this.#to.x - this.#from.x) > THRESHOLD ||
           Math.abs(this.#to.y - this.#from.y) > THRESHOLD;
  }

  rect() {
    return normalizeScreenRect(this.#from, this.#to);
  }

  end() {
    const wasActive = this.active;
    const rect = wasActive ? this.rect() : null;
    this.#from = null;
    this.#to = null;
    this.element.hidden = true;
    return rect;
  }
}
