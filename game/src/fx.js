// fx.js — transient pictures: tracers, impact sparks, muzzle flashes, the
// charge's explosion. Everything is pooled; the hot loop allocates nothing.

const MAX_TRACERS = 48, MAX_SPARKS = 240;

export function createFx(THREE, scene) {
  const tracers = [];
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = tracerGeo.clone();
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9b0, transparent: true, opacity: 0,
    }));
    line.frustumCulled = false; line.visible = false;
    scene.add(line);
    tracers.push({ line, until: 0 });
  }
  let tracerIdx = 0;

  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffc37a, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIdx = 0;
  for (let i = 0; i < MAX_SPARKS; i++) sparkPos[i * 3 + 1] = -50;

  const flashLight = new THREE.PointLight(0xffc37a, 0, 13, 1.6);
  scene.add(flashLight);
  let flashUntil = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0 }));
  boom.visible = false; scene.add(boom);
  const boomLight = new THREE.PointLight(0xff9040, 0, 30, 1.4);
  scene.add(boomLight);
  let boomAt = -1, boomPos = { x: 0, y: 0, z: 0 };
  let shake = 0;

  const V = { x: 0, y: 0, z: 0 };

  return {
    tracer(from, to, color, now) {
      const t = tracers[tracerIdx++ % MAX_TRACERS];
      const a = t.line.geometry.attributes.position.array;
      a[0] = from.x; a[1] = from.y; a[2] = from.z;
      a[3] = to.x; a[4] = to.y; a[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(color);
      t.line.material.opacity = 0.85;
      t.line.visible = true;
      t.until = now + 0.055;
    },
    impact(p, now, n = 6) {
      for (let k = 0; k < n; k++) {
        const i = sparkIdx++ % MAX_SPARKS;
        sparkPos[i * 3] = p.x; sparkPos[i * 3 + 1] = p.y; sparkPos[i * 3 + 2] = p.z;
        sparkVel[i * 3] = (Math.random() - 0.5) * 2.6;
        sparkVel[i * 3 + 1] = Math.random() * 2.4;
        sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 2.6;
        sparkLife[i] = 0.32 + Math.random() * 0.2;
      }
    },
    muzzle(p, now) {
      flashLight.position.set(p.x, p.y, p.z);
      flashLight.intensity = 26;
      flashUntil = now + 0.045;
    },
    explosion(p, now) {
      boomPos = { x: p.x, y: Math.max(0.8, p.y), z: p.z };
      boom.position.set(boomPos.x, boomPos.y, boomPos.z);
      boom.visible = true; boomAt = now;
      boomLight.position.set(boomPos.x, boomPos.y + 1, boomPos.z);
      shake = Math.min(1, shake + 0.9);
      this.impact(p, now, 40);
    },
    update(now, dt) {
      for (const t of tracers) {
        if (t.line.visible && now > t.until) t.line.visible = false;
      }
      if (now > flashUntil) flashLight.intensity = 0;
      let any = false;
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        any = true;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 6.5 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkLife[i] <= 0 || sparkPos[i * 3 + 1] < 0.02) { sparkLife[i] = 0; sparkPos[i * 3 + 1] = -50; }
      }
      if (any) sparkGeo.attributes.position.needsUpdate = true;
      if (boomAt >= 0) {
        const k = (now - boomAt) / 0.85;
        if (k >= 1) { boom.visible = false; boomAt = -1; boomLight.intensity = 0; }
        else {
          const s = 1 + k * 9;
          boom.scale.set(s, s * 0.8, s);
          boom.material.opacity = 0.55 * (1 - k);
          boomLight.intensity = 60 * (1 - k);
        }
      }
      shake = Math.max(0, shake - dt * 1.7);
      return shake;
    },
  };
}
