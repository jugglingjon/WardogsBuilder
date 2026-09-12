/**
 * A small valid construction used to exercise the model in the browser while
 * the editor panes are still being built: a FOB, a Hesco perimeter, a bunker,
 * and an Air Defense on the bunker roof.
 *
 * Every placement here obeys the same rules the editor will enforce, so if this
 * seeds without issues the validation layer agrees with itself.
 */
export function seedSampleBuild(model) {
  model.setName('Sample outpost');

  const cx = Math.floor(model.grid.width / 2);
  const cy = Math.floor(model.grid.depth / 2);

  model.addPiece({ type: 'fob', x: cx - 1, y: cy - 1, z: 0 });

  // A wall run along the north and south approaches.
  for (let i = 0; i < 3; i++) {
    model.addPiece({ type: 'hesco_wall_long', x: cx - 6 + i * 4, y: cy - 6, z: 0 });
    model.addPiece({ type: 'hesco_wall_long', x: cx - 6 + i * 4, y: cy + 5, z: 0 });
  }

  // Corner blocks, stacked two high.
  for (const [x, y] of [[cx - 7, cy - 6], [cx + 6, cy - 6], [cx - 7, cy + 5], [cx + 6, cy + 5]]) {
    model.addPiece({ type: 'hesco_block_tall', x, y, z: 0 });
    model.addPiece({ type: 'hesco_block', x, y, z: 2 });
  }

  // A bunker with an Air Defense on its roof, which is legal because the
  // bunker can support and its 4x4 top fully covers the 3x3 footprint.
  model.addPiece({ type: 'bunker', x: cx + 8, y: cy - 2, z: 0 });
  model.addPiece({ type: 'air_defense', x: cx + 8, y: cy - 2, z: 4 });

  model.emit('change', { reason: 'seed' });
}
