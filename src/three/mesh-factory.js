/**
 * Element type to renderable parts.
 *
 * An element occupies its full width x depth x height box whatever it looks
 * like, so shape only ever changes geometry. A hollow cylinder still fills the
 * same cells as the block it replaces, and the ghost that previews a placement
 * is still drawn as the box, because the box is what you are spending.
 *
 * Each type yields one material and a list of parts, every part a geometry with
 * a fixed transform inside the piece. sync.js turns each part into its own
 * instanced mesh, so draw calls track parts per element type rather than the
 * size of the build.
 */
import * as THREE from 'three';

/** A helix, for the barbed wire coil. */
class Helix extends THREE.Curve {
  constructor(radius, length, turns, axis) {
    super();
    Object.assign(this, { radius, length, turns, axis });
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = this.turns * Math.PI * 2 * t;
    const along = -this.length / 2 + this.length * t;
    const a = Math.cos(angle) * this.radius;
    const b = Math.sin(angle) * this.radius;
    return this.axis === 'z' ? target.set(a, b, along) : target.set(along, b, a);
  }
}

function canvasTexture(color, surface) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  const speckle = (count, alpha, dot) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = `rgb(0 0 0 / ${Math.random() * alpha})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, dot, dot);
    }
  };

  if (surface === 'gabion') {
    // Hesco baskets are wire cages full of fill: a grid over a speckled ground.
    speckle(2600, 0.16, 2);
    ctx.strokeStyle = 'rgb(0 0 0 / 0.24)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const at = (size / 4) * i;
      ctx.beginPath();
      ctx.moveTo(at, 0); ctx.lineTo(at, size);
      ctx.moveTo(0, at); ctx.lineTo(size, at);
      ctx.stroke();
    }
  } else if (surface === 'fabric') {
    // Sandbags: soft overlapping lumps rather than a flat face.
    for (let i = 0; i < 90; i++) {
      ctx.beginPath();
      ctx.fillStyle = `rgb(0 0 0 / ${Math.random() * 0.12})`;
      ctx.ellipse(Math.random() * size, Math.random() * size,
        8 + Math.random() * 10, 5 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (surface === 'metal') {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.07)';
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random());
      ctx.lineTo(size, y + Math.random());
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgb(255 255 255 / ${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 3, 3);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const part = (geometry, position = [0, 0, 0]) => ({ geometry, position });

/** Every shape fits inside the element's own w x h x d box, centred on it. */
const SHAPES = {
  block: (w, h, d) => [part(new THREE.BoxGeometry(w, h, d))],

  /** A wall with an opening through it: two jambs and a lintel. */
  doorway(w, h, d) {
    const openWidth = w * 0.55;
    const openHeight = h * 0.72;
    const jamb = (w - openWidth) / 2;
    const lintel = h - openHeight;
    return [
      part(new THREE.BoxGeometry(jamb, h, d), [-(w - jamb) / 2, 0, 0]),
      part(new THREE.BoxGeometry(jamb, h, d), [(w - jamb) / 2, 0, 0]),
      part(new THREE.BoxGeometry(openWidth, lintel, d), [0, (h - lintel) / 2, 0])
    ];
  },

  /** An upright tube: both walls, a rim and a floor, so it reads as hollow. */
  cylinder(w, h, d) {
    const outer = Math.min(w, d) / 2 * 0.94;
    const inner = outer * 0.78;
    const segments = 20;
    return [
      part(new THREE.CylinderGeometry(outer, outer, h, segments, 1, true)),
      part(new THREE.CylinderGeometry(inner, inner, h, segments, 1, true)),
      part(new THREE.RingGeometry(inner, outer, segments).rotateX(-Math.PI / 2), [0, h / 2, 0]),
      part(new THREE.CircleGeometry(inner, segments).rotateX(-Math.PI / 2), [0, -h / 2 + 0.02, 0])
    ];
  },

  /** A filled pillow, for stacked sandbags. */
  mound: (w, h, d) => [part(new THREE.SphereGeometry(0.5, 18, 12).scale(w, h, d))],

  /** Three crossing beams: six points, like a real anti-tank hedgehog. */
  hedgehog(w, h, d) {
    const t = Math.min(w, h, d) * 0.16;
    return [
      part(new THREE.BoxGeometry(w, t, t)),
      part(new THREE.BoxGeometry(t, h, t)),
      part(new THREE.BoxGeometry(t, t, d))
    ];
  },

  /** A coil running along the piece's longer horizontal axis. */
  spiral(w, h, d) {
    const axis = d >= w ? 'z' : 'x';
    const length = (axis === 'z' ? d : w) * 0.96;
    const radius = Math.min(axis === 'z' ? w : d, h) / 2 * 0.82;
    const turns = Math.max(3, Math.round(length * 2.5));
    const curve = new Helix(radius, length, turns, axis);
    return [part(new THREE.TubeGeometry(curve, turns * 10, 0.045, 6, false))];
  }
};

export class MeshFactory {
  #types = new Map();

  constructor(catalog) {
    this.catalog = catalog;
  }

  typeOf(elementId) {
    if (this.#types.has(elementId)) return this.#types.get(elementId);
    const element = this.catalog.get(elementId);
    const [w, d, h] = element.size;

    const shape = SHAPES[element.shape] ?? SHAPES.block;
    const parts = shape(w, h, d); // world axes: x width, y height, z depth
    const metal = element.surface === 'metal';

    const record = {
      element,
      parts,
      material: new THREE.MeshStandardMaterial({
        color: new THREE.Color(element.color),
        map: canvasTexture(element.color, element.surface ?? 'concrete'),
        roughness: metal ? 0.45 : 0.85,
        metalness: metal ? 0.5 : 0.02,
        // Open geometry (tube walls, rings) has to be lit from both faces.
        side: element.shape === 'cylinder' ? THREE.DoubleSide : THREE.FrontSide
      })
    };
    this.#types.set(elementId, record);
    return record;
  }

  dispose() {
    for (const record of this.#types.values()) {
      for (const p of record.parts) p.geometry.dispose();
      record.material.map?.dispose();
      record.material.dispose();
    }
    this.#types.clear();
  }
}
