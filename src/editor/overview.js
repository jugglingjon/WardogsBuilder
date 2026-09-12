/**
 * Navigation for the plan overview. Read-only: it pans, zooms and selects, and
 * never edits. Editing is the 3D view's job.
 */
export class OverviewController {
  #panning = null;
  #moved = false;

  constructor(canvas, { model, camera, renderer }) {
    this.canvas = canvas;
    this.model = model;
    this.camera = camera;
    this.renderer = renderer;

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.#panning = { px: event.clientX, py: event.clientY };
      this.#moved = false;
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!this.#panning) return;
      const dx = event.clientX - this.#panning.px;
      const dy = event.clientY - this.#panning.py;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.#moved = true;
      this.camera.panBy(dx, dy);
      this.#panning = { px: event.clientX, py: event.clientY };
      this.renderer.invalidate();
    });

    const release = (event) => {
      if (this.#panning && !this.#moved && event) this.#select(event);
      this.#panning = null;
      canvas.style.cursor = 'default';
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', () => release(null));

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.camera.zoomAt(
        event.clientX - rect.left, event.clientY - rect.top,
        Math.pow(0.999, event.deltaY)
      );
      this.renderer.invalidate();
    }, { passive: false });
  }

  /** Click selects the topmost piece in the column, matching what is drawn. */
  #select(event) {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.camera.cellAt(event.clientX - rect.left, event.clientY - rect.top);
    for (let z = this.model.grid.height - 1; z >= 0; z--) {
      const id = this.model.occupancy.at(x, y, z);
      if (id) return this.model.select(id, { additive: event.shiftKey });
    }
    if (!event.shiftKey) this.model.clearSelection();
  }

  fit() {
    const pieces = this.model.pieces();
    const bounds = pieces.length
      ? pieces.reduce((acc, piece) => {
          const [w, d] = this.model.elementOf(piece).size;
          const rotated = piece.rot % 180 === 90 ? [d, w] : [w, d];
          return {
            x0: Math.min(acc.x0, piece.x), y0: Math.min(acc.y0, piece.y),
            x1: Math.max(acc.x1, piece.x + rotated[0]),
            y1: Math.max(acc.y1, piece.y + rotated[1])
          };
        }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
      : { x0: 0, y0: 0, x1: this.model.grid.width, y1: this.model.grid.depth };
    this.camera.fit(bounds, this.renderer.viewport ?? { width: 400, height: 400 });
    this.renderer.invalidate();
  }
}
