/**
 * Pointer and keyboard handling for the plan pane, and the tools themselves.
 *
 * The controller owns no build state. It reads the model, asks validate.js
 * whether something is legal, and routes every mutation through a command so
 * undo stays uniform.
 */
import {
  canPlace, canMove, canPlaceAll, restingZ, dropZ, buildArea, REASON_TEXT
} from '../model/validate.js';
import { rotatedSize, ROTATIONS } from '../model/geometry.js';
import { normalizeRect, piecesInRect, boundsOfPieces } from '../model/query.js';
import { addPiece, deletePieces, movePieces, rotatePiece, composite } from '../model/commands.js';

export const TOOLS = { SELECT: 'select', PLACE: 'place', ERASE: 'erase' };

export class EditorController {
  #drag = null;
  #panning = null;
  #spaceHeld = false;
  #hover = null;
  #lastPainted = null;
  #marquee = null;
  #move = null;
  #clipboard = null;

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

  /** Copy the selection, keeping each piece's offset from the group's corner. */
  copy() {
    const ids = [...this.model.selection];
    if (!ids.length) return;
    const box = boundsOfPieces(this.model, ids);
    this.#clipboard = ids.map((id) => {
      const piece = this.model.piece(id);
      return {
        type: piece.type, rot: piece.rot,
        dx: piece.x - box.x0, dy: piece.y - box.y0, dz: piece.z - box.z0
      };
    });
    this.#status(`Copied ${ids.length} ${ids.length === 1 ? 'piece' : 'pieces'}`);
  }

  /**
   * Paste at the cursor. The group drops as one, so it lands on whatever is
   * under it rather than keeping the height it was copied from.
   */
  paste() {
    if (!this.#clipboard?.length) return;
    // Pasting with the cursor off the canvas, from a keyboard shortcut or a
    // menu, lands the group in the middle of what you are looking at rather
    // than doing nothing.
    const anchor = this.#hover ?? this.#viewCentreCell();
    if (!anchor) return;

    let baseZ = 0;
    for (const entry of this.#clipboard) {
      const footprint = {
        type: entry.type, rot: entry.rot,
        x: anchor.x + entry.dx, y: anchor.y + entry.dy
      };
      baseZ = Math.max(baseZ, dropZ(this.model, footprint) - entry.dz);
    }

    const specs = this.#clipboard.map((entry) => ({
      type: entry.type, rot: entry.rot,
      x: anchor.x + entry.dx, y: anchor.y + entry.dy, z: baseZ + entry.dz
    }));

    const result = canPlaceAll(this.model, specs);
    if (!result.ok) {
      this.#status(`Cannot paste here: ${result.reasons.map((r) => REASON_TEXT[r]).join(' · ')}`);
      return;
    }

    const group = composite(`Paste ${specs.length} ${specs.length === 1 ? 'piece' : 'pieces'}`);
    this.history.run(group);
    const pasted = specs.map((spec) => group.push(addPiece(this.model, spec)).id);
    this.model.select(pasted);
  }

  duplicate() {
    this.copy();
    this.paste();
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
      if (!moved) return;

      if (this.#move) this.#updateMove();
      else if (this.#marquee) this.#updateMarquee();
      else this.#refreshGhost();

      if (this.#drag) this.#continueDrag();
    });

    canvas.addEventListener('pointerleave', () => {
      if (this.#move || this.#marquee || this.#drag) return; // a drag is still live
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
      else this.#startSelect(event);
    });

    canvas.addEventListener('pointerup', (event) => this.#endPointer(event));
    canvas.addEventListener('pointercancel', () => this.#cancelPointer());

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.pow(0.999, event.deltaY);
      this.camera.zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
      this.renderer.invalidate();
      this.#refreshGhost();
    }, { passive: false });
  }

  #viewCentreCell() {
    const viewport = this.renderer.viewport;
    if (!viewport) return null;
    return this.camera.cellAt(viewport.width / 2, viewport.height / 2);
  }

  #pointerCell(event) {
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.cellAt(event.clientX - rect.left, event.clientY - rect.top);
  }

  #bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === 'c') { event.preventDefault(); this.copy(); }
        else if (key === 'v') { event.preventDefault(); this.paste(); }
        else if (key === 'd') { event.preventDefault(); this.duplicate(); }
        return;
      }

      switch (event.key) {
        case ' ': this.#spaceHeld = true; break;
        case 'v': case 'V': this.setTool(TOOLS.SELECT); break;
        case 'b': case 'B': this.setTool(TOOLS.PLACE); break;
        case 'e': case 'E': this.setTool(TOOLS.ERASE); break;
        case 'r': case 'R': this.rotate(); break;
        case 'Home': this.fit(); break;
        case 'Escape':
          if (this.#move || this.#marquee) this.#cancelPointer();
          else this.model.clearSelection();
          break;
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

  /**
   * Pressing on a piece starts a move; pressing on empty ground starts a
   * marquee. Both only commit on release, so nothing is mutated while the
   * pointer is still down and one drag is one undo step.
   */
  #startSelect(event) {
    const id = this.#pieceUnderCursor();
    if (id) {
      if (!this.model.selection.has(id)) this.model.select(id, { additive: event.shiftKey });
      this.#move = {
        from: { ...this.#hover },
        ids: [...this.model.selection],
        delta: { dx: 0, dy: 0 },
        valid: true
      };
      return;
    }
    if (!event.shiftKey) this.model.clearSelection();
    this.#marquee = { from: { ...this.#hover }, additive: event.shiftKey };
    this.renderer.setMarquee(normalizeRect(this.#hover, this.#hover));
  }

  #updateMove() {
    const dx = this.#hover.x - this.#move.from.x;
    const dy = this.#hover.y - this.#move.from.y;
    const result = (dx || dy) ? canMove(this.model, this.#move.ids, { dx, dy }) : { ok: true, reasons: [] };
    this.#move.delta = { dx, dy };
    this.#move.valid = result.ok;
    this.renderer.setMovePreview({ ids: this.#move.ids, delta: this.#move.delta, valid: result.ok });
    this.#status(result.ok ? null : result.reasons.map((r) => REASON_TEXT[r]).join(' · '));
  }

  #updateMarquee() {
    this.renderer.setMarquee(normalizeRect(this.#marquee.from, this.#hover));
  }

  #endPointer(event) {
    if (this.#move) {
      const { dx, dy } = this.#move.delta;
      if ((dx || dy) && this.#move.valid) {
        this.history.run(movePieces(this.model, this.#move.ids.map((id) => {
          const piece = this.model.piece(id);
          return { id, x: piece.x + dx, y: piece.y + dy, z: piece.z };
        })));
      }
      this.#move = null;
      this.renderer.setMovePreview(null);
    }

    if (this.#marquee) {
      const rect = normalizeRect(this.#marquee.from, this.#hover ?? this.#marquee.from);
      const ids = piecesInRect(this.model, rect);
      if (ids.length || !this.#marquee.additive) {
        this.model.select(ids, { additive: this.#marquee.additive });
      }
      this.#marquee = null;
      this.renderer.setMarquee(null);
    }

    this.#cancelPointer(event);
  }

  #cancelPointer() {
    this.#drag = null;
    this.#lastPainted = null;
    this.#panning = null;
    this.#move = null;
    this.#marquee = null;
    this.renderer.setMarquee(null);
    this.renderer.setMovePreview(null);
    this.canvas.style.cursor = this.tool === TOOLS.SELECT ? 'default' : 'crosshair';
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
