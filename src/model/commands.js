/**
 * Every user-facing mutation is a command with do() and undo(), so the history
 * stack holds commands rather than model snapshots and memory stays flat on
 * large builds. A drag pushes one command on release, not one per frame.
 */

export function addPiece(model, spec) {
  let id = spec.id ?? null;
  return {
    label: `Place ${model.catalog.get(spec.type).name}`,
    do() {
      const piece = model.addPiece(id ? { ...spec, id } : spec);
      id = piece.id;
      model.select(id);
      return piece;
    },
    undo() {
      model.removePiece(id);
    }
  };
}

export function deletePieces(model, ids) {
  const list = [...ids];
  let snapshots = [];
  return {
    label: list.length === 1 ? 'Delete piece' : `Delete ${list.length} pieces`,
    do() {
      snapshots = list.map((id) => ({ ...model.piece(id) })).filter((p) => p.id);
      for (const id of list) model.removePiece(id);
    },
    undo() {
      for (const snapshot of snapshots) model.addPiece(snapshot);
      model.select(snapshots.map((s) => s.id));
    }
  };
}

/** One command for a whole drag, so one undo reverses one drag. */
export function movePieces(model, moves) {
  const before = moves.map(({ id }) => {
    const p = model.piece(id);
    return { id, x: p.x, y: p.y, z: p.z, rot: p.rot };
  });
  return {
    label: moves.length === 1 ? 'Move piece' : `Move ${moves.length} pieces`,
    do() {
      for (const move of moves) {
        const { id, ...patch } = move;
        model.updatePiece(id, patch);
      }
    },
    undo() {
      for (const state of before) {
        const { id, ...patch } = state;
        model.updatePiece(id, patch);
      }
    }
  };
}

export function rotatePiece(model, id, rot) {
  const previous = model.piece(id).rot;
  return {
    label: 'Rotate piece',
    do() { model.updatePiece(id, { rot }); },
    undo() { model.updatePiece(id, { rot: previous }); }
  };
}

/**
 * A group of commands that undo together, built up as a drag proceeds.
 *
 * Painting a run of walls should be one undo step, not one per cell, so the
 * composite goes onto the history stack when the drag starts and grows as the
 * cursor moves.
 */
export function composite(label) {
  const done = [];
  return {
    label,
    get size() { return done.length; },
    push(command) {
      const result = command.do();
      done.push(command);
      return result;
    },
    do() {
      for (const command of done) command.do();
    },
    undo() {
      for (let i = done.length - 1; i >= 0; i--) done[i].undo();
    }
  };
}
