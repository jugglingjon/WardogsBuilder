/**
 * A small valid construction used to exercise the model in the browser: a Hesco
 * perimeter around the site's FOB, a bunker, and a Stingray on its roof.
 *
 * Every placement here obeys the same rules the editor will enforce, so if this
 * seeds without issues the validation layer agrees with itself.
 */
export function seedSampleBuild(model) {
  model.setName('Sample outpost');

  // The FOB is already there: the site places it at the centre.
  const cx = Math.floor(model.grid.width / 2);
  const cy = Math.floor(model.grid.depth / 2);

  // A wall run along the north and south approaches.
  for (let i = 0; i < 3; i++) {
    model.addPiece({ type: 'hesco_wall', x: cx - 6 + i * 4, y: cy - 6, z: 0 });
    model.addPiece({ type: 'hesco_wall', x: cx - 6 + i * 4, y: cy + 5, z: 0 });
  }

  // Corner blocks, stacked two high.
  for (const [x, y] of [[cx - 7, cy - 6], [cx + 6, cy - 6], [cx - 7, cy + 5], [cx + 6, cy + 5]]) {
    model.addPiece({ type: 'hesco_block_large', x, y, z: 0 });
    model.addPiece({ type: 'hesco_block_small', x, y, z: 2 });
  }

  // A bunker with a Stingray on its roof, which is legal because the bunker can
  // support and its 4x4 top fully covers the 3x3 footprint.
  model.addPiece({ type: 'bunker', x: cx + 8, y: cy - 2, z: 0 });
  model.addPiece({ type: 'stingray', x: cx + 8, y: cy - 2, z: 2 });

  model.emit('change', { reason: 'seed' });
}
