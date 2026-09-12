/**
 * Pan and zoom for the plan pane.
 *
 * Scale is pixels per metre, so one grid cell is `scale` pixels square. The
 * camera converts in both directions and nothing else in the editor does any
 * coordinate arithmetic.
 */
export const MIN_SCALE = 2;
export const MAX_SCALE = 64;

export class Camera2D {
  constructor({ scale = 10, x = 0, y = 0 } = {}) {
    this.scale = scale;
    this.x = x; // screen px offset of grid origin
    this.y = y;
  }

  gridToScreen(gx, gy) {
    return { px: this.x + gx * this.scale, py: this.y + gy * this.scale };
  }

  screenToGrid(px, py) {
    return { gx: (px - this.x) / this.scale, gy: (py - this.y) / this.scale };
  }

  /** The cell under a screen point, floored to integers. */
  cellAt(px, py) {
    const { gx, gy } = this.screenToGrid(px, py);
    return { x: Math.floor(gx), y: Math.floor(gy) };
  }

  panBy(dx, dy) {
    this.x += dx;
    this.y += dy;
  }

  /** Zoom about a screen point, so the grid stays put under the cursor. */
  zoomAt(px, py, factor) {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
    if (next === this.scale) return;
    const { gx, gy } = this.screenToGrid(px, py);
    this.scale = next;
    this.x = px - gx * this.scale;
    this.y = py - gy * this.scale;
  }

  /** Frame a grid-space rectangle inside a viewport, with a margin in px. */
  fit({ x0, y0, x1, y1 }, viewport, margin = 24) {
    const width = Math.max(1, x1 - x0);
    const depth = Math.max(1, y1 - y0);
    const scale = Math.min(
      (viewport.width - margin * 2) / width,
      (viewport.height - margin * 2) / depth
    );
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
    this.x = viewport.width / 2 - (x0 + width / 2) * this.scale;
    this.y = viewport.height / 2 - (y0 + depth / 2) * this.scale;
  }

  /** The grid-space rectangle currently visible, used to cull drawing. */
  visibleBounds(viewport) {
    const topLeft = this.screenToGrid(0, 0);
    const bottomRight = this.screenToGrid(viewport.width, viewport.height);
    return {
      x0: Math.floor(topLeft.gx), y0: Math.floor(topLeft.gy),
      x1: Math.ceil(bottomRight.gx), y1: Math.ceil(bottomRight.gy)
    };
  }
}
