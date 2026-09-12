/**
 * A label that follows the cursor over the 3D view, naming whatever is under
 * it. A build is a lot of similar brown boxes; being able to point at one and
 * be told what it is saves counting cells.
 */
const OFFSET = 16;

export class Tooltip {
  #text = null;

  constructor(host) {
    this.host = host;
    this.element = document.createElement('div');
    this.element.className = 'tooltip';
    this.element.hidden = true;
    host.append(this.element);
  }

  /** Position is in the host's own pixel space. */
  show(text, x, y) {
    if (text !== this.#text) {
      this.#text = text;
      this.element.textContent = text;
    }
    this.element.hidden = false;

    // Flip to the other side of the cursor rather than run off the edge.
    const bounds = this.host.getBoundingClientRect();
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const left = x + OFFSET + width > bounds.width ? x - OFFSET - width : x + OFFSET;
    const top = y + OFFSET + height > bounds.height ? y - OFFSET - height : y + OFFSET;
    this.element.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`;
  }

  hide() {
    if (this.element.hidden) return;
    this.element.hidden = true;
    this.#text = null;
  }
}

/** What a tooltip says about a piece: what it is, how big, what it cost. */
export function describe(element) {
  const [w, d, h] = element.size;
  return `${element.name} · ${w}×${d}×${h} m · ${element.cost}`;
}
