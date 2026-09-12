/**
 * Pointer and keyboard handling for the plan pane, and the tools themselves.
 *
 * The controller owns no build state. It reads the model, asks validate.js
 * whether something is legal, and routes every mutation through a command so
 * undo stays uniform.
 */
import { canPlace, restingZ, buildArea, REASON_TEXT } from '../model/validate.js';
import { rotatedSize } from '../model/geometry.js';
import { addPiece, deletePieces, rotatePiece, composite } from '../model/commands.js';
import { ROTATIONS } from '../model/geometry.js';

export const TOOLS = { SELECT: 'select', PLACE: 'place', ERASE: 'erase' };

export class EditorController {
  #drag = null;
  #panning = null;
  #spaceHeld = false;
  #hover = null;
  #lastPainted = null;

  constructor(canvas, { model, history, camera, renderer, onStatus, onToolChange }) {
    this.canvas = canvas;
    this.model = model;
    this.history = history;
    this.camera = camera;
    this.renderer = renderer;
    this.onStatus = onStatus;
    this.onToolChange = onToolChange;

    this.tool = TOOLS.PLACE;
    this.activeElement = null;
    this.rotation = 0;
    this.forceSliceHeight = false;

    this.#bindPointer();
    this.#bindKeyboard();
    model.on('slice:change', () => this.#refreshGhost());
    model.on('change', () => this.#refreshGhost());
  }

  setTool(tool) {
    this.tool = tool;
    this.canvas.style.cursor = tool === TOOLS.SELECT ? 'default' : 'crosshair';
    if (tool !== TOOLS.PLACE) this.renderer.setGhost(null);
    this.#refreshGhost();
    this.onToolChange?.(tool);
  }

  setActiveElement(id) {
    this.activeElement = id;
    if (id) this.setTool(TOOLS.PLACE);
  }

  rotate() {
    if (this.tool === TOOLS.PLACE) {
      this.rotation = ROTATIONS[(ROTATIONS.indexOf(this.rotation) + 1) % ROTATIONS.length];
      this.#refreshGhost();
      return;
    }
    const [id] = [...this.model.selection];
    if (!id) return;
    const piece = this.model.piece(id);
    const next = ROTATIONS[(ROTATIONS.indexOf(piece.rot) + 1) % ROTATIONS.length];
    const command = rotatePiece(this.model, id, next);
    command.do();
    if (canPlace(this.model, this.model.piece(id), { ignoreId: id }).ok) {
      command.undo();
      this.history.run(command);
    } else {
      command.undo(); // rotating here would be illegal, so leave it alone
      this.#status('Cannot rotate there');
    }
  }

  deleteSelection() {
    if (!this.model.selection.size) return;
    this.history.run(deletePieces(this.model, [...this.model.selection]));
  }

  fit() {
    const pieces = this.model.pieces();
    const bounds = pieces.length
      ? pieces.reduce((acc, piece) => {
          const [w, d] = rotatedSize(this.model.elementOf(piece).size, piece.rot);
          return {
            x0: Math.min(acc.x0, piece.x), y0: Math.min(acc.y0, piece.y),
            x1: Math.max(acc.x1, piece.x + w), y1: Math.max(acc.y1, piece.y + d)
          };
        }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity })
      : buildArea(this.model);
    this.camera.fit(bounds, this.renderer.viewport ?? { width: 600, height: 600 });
    this.renderer.invalidate();
  }

  // --- ghost ----------------------------------------------------------------

  /** The placement the cursor currently implies, centred on the hovered cell. */
  #proposed() {
    if (!this.#hover || !this.activeElement) return null;
    const element = this.model.catalog.get(this.activeElement);
    const [w, d] = rotatedSize(element.size, this.rotation);
    const piece = {
      id: '__ghost__',
      type: this.activeElement,
      rot: this.rotation,
      x: this.#hover.x - Math.floor((w - 1) / 2),
      y: this.#hover.y - Math.floor((d - 1) / 2),
      z: 0
    };
    piece.z = this.forceSliceHeight
      ? this.model.slice
      : restingZ(this.model, piece);
    return piece;
  }

  #refreshGhost() {
    if (this.tool !== TOOLS.PLACE || !this.#hover || !this.activeElement) {
      this.renderer.setGhost(null);
      this.#status();
      return;
    }
    const piece = this.#proposed();
    const result = canPlace(this.model, piece);
    this.renderer.setGhost({ piece, valid: result.ok });
    this.#status(result.ok ? null : result.reasons.map((r) => REASON_TEXT[r]).join(' · '), piece.z);
  }

  #status(message = null, z = null) {
    this.onStatus?.({
      cell: this.#hover,
      z,
      message,
      tool: this.tool
    });
  }

  // --- input ----------------------------------------------------------------

  #bindPointer() {
    const canvas = this.canvas;

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointermove', (event) => {
      const { x, y } = this.#pointerCell(event);
      if (this.#panning) {
        this.camera.panBy(event.clientX - this.#panning.px, event.clientY - this.#panning.py);
        this.#panning = { px: event.clientX, py: event.clientY };
        this.renderer.invalidate();
        return;
      }
      const moved = !this.#hover || this.#hover.x !== x || this.#hover.y !== y;
      this.#hover = { x, y };
      if (moved) {
        this.#refreshGhost();
        if (this.#drag) this.#continueDrag();
      }
    });

    canvas.addEventListener('pointerleave', () => {
      this.#hover = null;
      this.renderer.setGhost(null);
      this.#status();
    });

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      const panRequested = event.button === 1 || event.button === 2 || this.#spaceHeld;
      if (panRequested) {
        this.#panning = { px: event.clientX, py: event.clientY };
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (event.button !== 0) return;

      this.#hover = this.#pointerCell(event);
      if (this.tool === TOOLS.PLACE) this.#startPaint();
      else if (this.tool === TOOLS.ERASE) this.#startErase();
      else this.#clickSelect(event);
    });

    const endDrag = () => {
      this.#drag = null;
      this.#lastPainted = null;
      this.#panning = null;
      canvas.style.cursor = this.tool === TOOLS.SELECT ? 'default' : 'crosshair';
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.pow(0.999, event.deltaY);
      this.camera.zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
      this.renderer.invalidate();
      this.#refreshGhost();
    }, { passive: false });
  }

  #pointerCell(event) {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.cellAt(event.clientX - rect.left, event.clientY - rect.top);
  }

  #bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.metaKey || event.ctrlKey) return;

      switch (event.key) {
        case ' ': this.#spaceHeld = true; break;
        case 'v': case 'V': this.setTool(TOOLS.SELECT); break;
        case 'b': case 'B': this.setTool(TOOLS.PLACE); break;
        case 'e': case 'E': this.setTool(TOOLS.ERASE); break;
        case 'r': case 'R': this.rotate(); break;
        case 'Home': this.fit(); break;
        case 'Escape': this.model.clearSelection(); break;
        case 'Delete': case 'Backspace':
          event.preventDefault();
          this.deleteSelection();
          break;
        case 'Alt': break;
        default: return;
      }
    });

    window.addEventListener('keyup', (event) => {
      if (event.key === ' ') this.#spaceHeld = false;
    });

    // Alt forces placement at exactly the current slice instead of resting on
    // whatever is below, for the rare case where that is what you want.
    const syncAlt = (event) => {
      if (this.forceSliceHeight === event.altKey) return;
      this.forceSliceHeight = event.altKey;
      this.#refreshGhost();
    };
    window.addEventListener('keydown', syncAlt);
    window.addEventListener('keyup', syncAlt);
  }

  // --- tools ----------------------------------------------------------------

  #startPaint() {
    if (!this.activeElement) return;
    this.#drag = composite('Place elements');
    this.history.run(this.#drag);
    this.#paintHere();
  }

  #continueDrag() {
    if (!this.#drag) return;
    if (this.tool === TOOLS.PLACE) this.#paintHere();
    else if (this.tool === TOOLS.ERASE) this.#eraseHere();
  }

  #paintHere() {
    const piece = this.#proposed();
    if (!piece) return;
    const key = `${piece.x}:${piece.y}:${piece.z}`;
    if (this.#lastPainted === key) return;
    if (!canPlace(this.model, piece).ok) return;
    this.#lastPainted = key;
    const { id, ...spec } = piece;
    this.#drag.push(addPiece(this.model, spec));
    this.#refreshGhost();
  }

  #startErase() {
    this.#drag = composite('Erase elements');
    this.history.run(this.#drag);
    this.#eraseHere();
  }

  #eraseHere() {
    const id = this.#pieceUnderCursor();
    if (!id) return;
    this.#drag.push(deletePieces(this.model, [id]));
  }

  #clickSelect(event) {
    const id = this.#pieceUnderCursor();
    if (!id) {
      if (!event.shiftKey) this.model.clearSelection();
      return;
    }
    this.model.select(id, { additive: event.shiftKey });
  }

  /**
   * What the cursor is over on this slice. Falls back to the topmost piece in
   * the column, so clicking a wall while standing on the ground slice still
   * selects it rather than nothing.
   */
  #pieceUnderCursor() {
    if (!this.#hover) return null;
    const { x, y } = this.#hover;
    const direct = this.model.occupancy.at(x, y, this.model.slice);
    if (direct) return direct;
    for (let z = this.model.grid.height - 1; z >= 0; z--) {
      const id = this.model.occupancy.at(x, y, z);
      if (id) return id;
    }
    return null;
  }
}
