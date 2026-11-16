// map.js — Cinderpass: an original dusk rail-yard. Two sites (A silo yard,
// B depot), three lanes (north run, the Cut through mid, depot row south)
// joined by two connectors and an east rotation. The map is data first:
// solid boxes for collision, sight-lines and navigation, then the three.js
// geometry that dresses them.

export const BOUNDS = { x0: -48, x1: 48, z0: -32, z1: 32 };

// kind -> look: flat-shaded standard materials in the dusk palette.
const KINDS = {
  wall: { color: 0x8a7a63, rough: 0.95 },
  concrete: { color: 0x9b968c, rough: 0.9 },
  metal: { color: 0x5d6d72, rough: 0.6, metal: 0.55 },
  rust: { color: 0x9c5a33, rough: 0.8, metal: 0.3 },
  crate: { color: 0xa97c46, rough: 0.9 },
  dark: { color: 0x3c4147, rough: 0.7, metal: 0.4 },
};

// Solid boxes: x0,x1,z0,z1 on the ground plan, y0..y1 vertical span.
function B(list, x0, x1, z0, z1, y1, kind, y0 = 0) {
  list.push({ x0, x1, z0, z1, y0, y1, kind });
  return list[list.length - 1];
}

export function buildColliders() {
  const c = [];
  // Perimeter
  B(c, -49, -48, -33, 33, 5, 'wall'); B(c, 48, 49, -33, 33, 5, 'wall');
  B(c, -49, 49, -33, -32, 5, 'wall'); B(c, -49, 49, 32, 33, 5, 'wall');
  // Lane dividers (gaps at the two connectors and at mid)
  for (const z of [[-11, -10], [10, 11]]) {
    B(c, -48, -18, z[0], z[1], 3.2, 'concrete');
    B(c, -14, -2, z[0], z[1], 3.2, 'concrete');
    B(c, 2, 14, z[0], z[1], 3.2, 'concrete');
    B(c, 18, 48, z[0], z[1], 3.2, 'concrete');
  }
  // North lane: the silo-run block splits the lane into two passes.
  B(c, -8, 2, -26, -16, 3.4, 'metal');
  B(c, -20, -18, -24, -18, 1.15, 'crate'); B(c, -20, -18, -24, -18, 2.3, 'crate', 1.15);
  B(c, 8, 10, -28, -26, 1.15, 'crate');
  // Site A: three silos (square colliders under round tanks) + cover.
  for (const [sx, sz] of [[28, -24], [36, -19], [31, -27]]) B(c, sx - 2.2, sx + 2.2, sz - 2.2, sz + 2.2, 9, 'rust');
  B(c, 23, 25, -17, -15, 1.15, 'crate'); B(c, 23, 25, -17, -15, 2.3, 'crate', 1.15);
  B(c, 35, 37.5, -25, -23.5, 1.15, 'crate');
  B(c, 26, 27.2, -13.5, -12.3, 2.6, 'dark'); // A entry container
  // Mid: container stacks in the Cut + the catwalk over it.
  B(c, -8, -3, -4.5, -2, 2.6, 'rust');
  B(c, 3, 8, 2, 4.5, 2.6, 'metal');
  B(c, -2, 2, 5.5, 8, 1.3, 'dark');
  B(c, -3, 3, -1.2, 1.2, 3.0, 'metal', 2.7); // catwalk deck
  for (let i = 0; i < 4; i++) { // steps up, 0.75 each side
    B(c, -6.6 + i * 0.9, -5.7 + i * 0.9, -1.1, 1.1, 0.75 * (i + 1), 'concrete');
    B(c, 5.7 - i * 0.9, 6.6 - i * 0.9, -1.1, 1.1, 0.75 * (i + 1), 'concrete');
  }
  B(c, -14, -12.5, 3, 5, 1.15, 'crate');
  B(c, 12, 14, -6, -4, 1.15, 'crate'); B(c, 12, 14, -6, -4, 2.3, 'crate', 1.15);
  // South lane: depot block + shed cover.
  B(c, 8, 14, 16, 22, 3.0, 'wall');
  B(c, -6, -4, 18, 20, 1.15, 'crate'); B(c, -6, -4, 18, 20, 2.3, 'crate', 1.15);
  B(c, 18, 20, 24, 26, 1.15, 'crate');
  // Site B: container wall + crates + the depot silo.
  B(c, 24, 29, 24.5, 27, 2.6, 'rust');
  B(c, 33, 35, 14.5, 16.5, 1.15, 'crate'); B(c, 33, 35, 14.5, 16.5, 2.3, 'crate', 1.15);
  B(c, 37.8, 42.2, 17.8, 22.2, 8, 'metal');
  B(c, 25, 26.2, 13, 14.2, 2.6, 'dark'); // B entry container
  // Spawn dressing: low cover so neither spawn is a bare box.
  B(c, -40, -38, -8, -6, 1.15, 'crate'); B(c, -40, -38, 6, 8, 1.15, 'crate');
  B(c, 39, 41, -8, -6.8, 1.3, 'dark'); B(c, 39, 41, 6.8, 8, 1.3, 'dark');
  return c;
}

export const SITES = {
  A: { x: 30, z: -20, r: 5.5, name: 'Site A — Silo Yard' },
  B: { x: 30, z: 20, r: 5.5, name: 'Site B — Depot' },
};

export const SPAWNS = {
  jackal: [{ x: -42, z: -4 }, { x: -42, z: 4 }, { x: -44.5, z: 0 }],
  warden: [{ x: 42, z: -4 }, { x: 42, z: 4 }, { x: 44.5, z: 0 }],
};

// Navigation graph. y comes from the ground under each node.
const NODES = [
  [-42, -4], [-42, 4], [-34, -16], [-34, 0], [-34, 16], [-22, -21], [-16, -14],
  [-16, -6], [-20, 0], [-8, -3], [-7, 0], [0, 0], [7, 0], [16, 0], [16, -6],
  [16, -14], [22, -18], [30, -20], [36, -24], [42, -4], [42, 4], [22, 18],
  [30, 20], [36, 24], [16, 6], [16, 14], [-22, 21], [8, 3], [-2, -28],
  [-2, -13], [11, 26], [30, -6], [30, 6], [-16, 6], [-16, 14],
];
const EDGES = [
  [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 5], [5, 28], [28, 29],
  [29, 16], [5, 6], [6, 7], [7, 8], [3, 8], [4, 26], [26, 30], [30, 21],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 27], [27, 13], [13, 14], [14, 15],
  [15, 16], [16, 17], [17, 18], [13, 31], [31, 17], [31, 32], [32, 22],
  [13, 24], [24, 25], [25, 21], [21, 22], [22, 23], [8, 33], [33, 34],
  [34, 26], [19, 31], [19, 13], [20, 32], [20, 13], [19, 16], [20, 21],
  [27, 14], [29, 15], [9, 7],
];
export const WAYPOINTS = {
  nodes: NODES.map(([x, z], id) => ({ id, x, z })),
  edges: EDGES,
  adj: (() => {
    const adj = NODES.map(() => []);
    for (const [a, b] of EDGES) { adj[a].push(b); adj[b].push(a); }
    return adj;
  })(),
};

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (const n of WAYPOINTS.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

// A* over the waypoint graph; returns a list of node ids or null.
export function findPath(fromId, toId) {
  if (fromId === toId) return [fromId];
  const nodes = WAYPOINTS.nodes;
  const open = new Map([[fromId, 0]]);
  const came = new Map(), gScore = new Map([[fromId, 0]]);
  const h = (id) => Math.hypot(nodes[id].x - nodes[toId].x, nodes[id].z - nodes[toId].z);
  const closed = new Set();
  while (open.size) {
    let cur = -1, cf = Infinity;
    for (const [id, f] of open) if (f < cf) { cf = f; cur = id; }
    if (cur === toId) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur); closed.add(cur);
    for (const nb of WAYPOINTS.adj[cur]) {
      if (closed.has(nb)) continue;
      const g = gScore.get(cur) + Math.hypot(nodes[nb].x - nodes[cur].x, nodes[nb].z - nodes[cur].z);
      if (g < (gScore.get(nb) ?? Infinity)) {
        gScore.set(nb, g); came.set(nb, cur); open.set(nb, g + h(nb));
      }
    }
  }
  return null;
}

// --- physics queries -------------------------------------------------------

// Highest box top at (x,z) that an entity standing at fromY can step onto.
export function groundHeight(colliders, x, z, fromY) {
  let g = 0;
  for (const b of colliders) {
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= fromY + 0.8 && b.y1 > g) g = b.y1;
  }
  return g;
}

// Push a cylinder (feet at pos.y, radius r, height h) out of every box it
// cannot step onto. Axis-separated, two passes; mutates pos.
export function collide(colliders, pos, r, h) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of colliders) {
      if (b.y1 <= pos.y + 0.8 || b.y0 >= pos.y + h) continue; // steppable or overhead
      const nx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const nz = Math.max(b.z0, Math.min(pos.z, b.z1));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        // centre inside the box: leave by the shallowest face
        const pl = pos.x - b.x0, pr = b.x1 - pos.x, pn = pos.z - b.z0, pf = b.z1 - pos.z;
        const m = Math.min(pl, pr, pn, pf);
        if (m === pl) pos.x = b.x0 - r; else if (m === pr) pos.x = b.x1 + r;
        else if (m === pn) pos.z = b.z0 - r; else pos.z = b.z1 + r;
      }
    }
  }
  pos.x = Math.max(BOUNDS.x0 + r, Math.min(BOUNDS.x1 - r, pos.x));
  pos.z = Math.max(BOUNDS.z0 + r, Math.min(BOUNDS.z1 - r, pos.z));
}

// Ray vs boxes (slab test, vertical span honoured). Returns distance or Infinity.
export function rayHit(colliders, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (const b of colliders) {
    let t0 = 0, t1 = best;
    // X slab
    if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; }
    else {
      let ta = (b.x0 - ox) / dx, tb = (b.x1 - ox) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    // Y slab
    if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) continue; }
    else {
      let ta = (b.y0 - oy) / dy, tb = (b.y1 - oy) / dy;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; }
    else {
      let ta = (b.z0 - oz) / dz, tb = (b.z1 - oz) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    if (t0 < best && t0 >= 0) best = t0;
  }
  return best;
}

export function losClear(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  return rayHit(colliders, ax, ay, az, dx / len, dy / len, dz / len, len) >= len - 1e-4;
}

export function forwardVec(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp;
  return out;
}

// --- the dressed scene -----------------------------------------------------

function groundTexture(THREE) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = '#6e5b43'; g.fillRect(0, 0, 1024, 1024);
  // worn asphalt lanes and dirt, in broad strokes
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${40 + Math.random() * 60 | 0},${30 + Math.random() * 44 | 0},${18 + Math.random() * 30 | 0},0.08)`;
    const s = 6 + Math.random() * 42;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, s, s * 0.6);
  }
  g.fillStyle = 'rgba(52,50,48,0.55)';
  g.fillRect(0, 462, 1024, 100); // the Cut, paved
  g.fillRect(0, 120, 1024, 130); g.fillRect(0, 774, 1024, 130); // lanes
  g.strokeStyle = 'rgba(230,200,130,0.5)'; g.lineWidth = 5; g.setLineDash([26, 20]);
  g.beginPath(); g.moveTo(0, 512); g.lineTo(1024, 512); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function letterSprite(THREE, letter, color) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '700 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 10;
  g.fillStyle = color; g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(2.0, 2.0, 1);
  return spr;
}

export function buildScene(THREE, colliders) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2e2a33);
  scene.fog = new THREE.Fog(0x4a3b33, 55, 150);

  const hemi = new THREE.HemisphereLight(0x93b5c9, 0x54402a, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb066, 2.0);
  sun.position.set(-38, 34, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 130; sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x604c38, 0.35));

  // Distant mesas: flat silhouettes against the dusk.
  const mesaMat = new THREE.MeshBasicMaterial({ color: 0x3a2f2c });
  for (const [mx, mz, mw, mh] of [[-90, -40, 60, 13], [85, -55, 74, 17], [10, -95, 120, 11], [-70, 70, 80, 9], [95, 45, 55, 12]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(mw, mh, 18), mesaMat);
    m.position.set(mx, mh / 2 - 0.5, mz); scene.add(m);
  }
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc37a, fog: false }));
  sunBall.position.set(-95, 21, -48); scene.add(sunBall);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 160),
    new THREE.MeshStandardMaterial({ map: groundTexture(THREE), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);

  const mats = {};
  for (const [k, v] of Object.entries(KINDS)) {
    mats[k] = new THREE.MeshStandardMaterial({ color: v.color, roughness: v.rough, metalness: v.metal || 0 });
  }
  const boxGeoCache = new Map();
  const geoFor = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  };
  for (const b of colliders) {
    if (b.y1 - b.y0 < 0.05) continue;
    const mesh = new THREE.Mesh(geoFor(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), mats[b.kind]);
    mesh.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // The silos themselves: rusted tanks standing on their square colliders.
  const siloGeo = new THREE.CylinderGeometry(2.5, 2.5, 9.6, 20);
  const siloTop = new THREE.CylinderGeometry(0.4, 2.5, 1.1, 20);
  for (const [sx, sz] of [[28, -24], [36, -19], [31, -27], [39.9, 20]]) {
    const s = new THREE.Mesh(siloGeo, mats.rust);
    s.position.set(sx, 4.8, sz); s.castShadow = true; s.receiveShadow = true; scene.add(s);
    const t = new THREE.Mesh(siloTop, mats.dark);
    t.position.set(sx, 10.1, sz); t.castShadow = true; scene.add(t);
  }
  // Catwalk rails: two thin boxes along the deck edges (visual only).
  const railMat = mats.dark;
  for (const rz of [-1.25, 1.25]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.08, 0.08), railMat);
    rail.position.set(0, 4.0, rz); scene.add(rail);
  }
  // Site rings + floating letters.
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xffb054 : 0x6fe0cf, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(site.x, 0.06, site.z);
    scene.add(ring);
    const spr = letterSprite(THREE, key, key === 'A' ? '#ffb054' : '#6fe0cf');
    spr.position.set(site.x, 6.3, site.z); scene.add(spr);
  }
  return scene;
}
