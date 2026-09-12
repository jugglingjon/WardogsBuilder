/**
 * Click a mesh in the 3D view to select the piece in the model, which selects
 * it in the plan pane too. Linking the panes both ways is what makes them feel
 * like one tool rather than an editor next to a screenshot.
 */
import * as THREE from 'three';

export function bindPicking(canvas, { model, view, onPick }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;

  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!down) return;
    const travelled = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (travelled > 4) return; // an orbit drag, not a click

    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, view.camera);
    const hits = raycaster.intersectObjects(view.pieces.children, true);
    const hit = hits.find((h) => h.object.userData.pieceId || h.object.parent?.userData.pieceId);
    const id = hit?.object.userData.pieceId ?? hit?.object.parent?.userData.pieceId ?? null;

    if (!id) {
      if (!event.shiftKey) model.clearSelection();
      return;
    }
    model.select(id, { additive: event.shiftKey });
    onPick?.(id);
  });
}
