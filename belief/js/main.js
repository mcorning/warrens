import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

async function loadSchema() {
  const res = await fetch("./schema.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`schema.json load failed: ${res.status}`);
  return res.json();
}

async function loadTOC(schema) {
  const tocHost = $("tocItems");
  const content = $("content");
  if (!tocHost || !content) return;

  tocHost.innerHTML = "";

  const setContent = (html) => {
    content.innerHTML = html;
    content.scrollTop = 0;
  };

  const mdToHtml = (md) => {
    const esc = (s) =>
      s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

    const lines = md.split(/\r?\n/);
    let out = [];
    let inCode = false;

    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        inCode = !inCode;
        out.push(inCode ? "<pre><code>" : "</code></pre>");
        continue;
      }
      if (inCode) {
        out.push(esc(line));
        continue;
      }
      if (line.startsWith("# ")) out.push(`<h1>${esc(line.slice(2))}</h1>`);
      else if (line.startsWith("## ")) out.push(`<h2>${esc(line.slice(3))}</h2>`);
      else if (line.startsWith("### ")) out.push(`<h3>${esc(line.slice(4))}</h3>`);
      else if (line.trim() === "") out.push("");
      else out.push(`<p>${esc(line)}</p>`);
    }
    return out.join("\n");
  };

  for (const item of schema.toc ?? []) {
    const btn = document.createElement("button");
    btn.className = "toc-item";
    btn.textContent = item.title ?? item.id;
    btn.addEventListener("click", async () => {
      try {
        const r = await fetch(item.src, { cache: "no-store" });
        const md = await r.text();
        setContent(mdToHtml(md));
      } catch {
        setContent(`<p style="color:#ffb4b4">Failed to load: ${item.src}</p>`);
      }
    });
    tocHost.appendChild(btn);
  }
}

function parseColor(css, fallbackHex = "#cfd8e3") {
  try { return new THREE.Color(css ?? fallbackHex); }
  catch { return new THREE.Color(fallbackHex); }
}

function makeTextSprite(
  text,
  {
    fontSize = 56,
    padding = 18,
    color = "#e6edf3",
    bg = "rgba(0,0,0,0.25)",
    border = "rgba(255,255,255,0.18)",
    borderWidth = 2,
    radius = 14,
    baseScale = 0.32,
    renderOrder = 10
  } = {}
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  const textW = Math.ceil(ctx.measureText(text).width);

  const w = textW + padding * 2;
  const h = fontSize + padding * 2;
  canvas.width = w;
  canvas.height = h;

  const rr = (x, y, w, h, r) => {
    const r2 = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r2, y);
    ctx.arcTo(x + w, y, x + w, y + h, r2);
    ctx.arcTo(x + w, y + h, x, y + h, r2);
    ctx.arcTo(x, y + h, x, y, r2);
    ctx.arcTo(x, y, x + w, y, r2);
    ctx.closePath();
  };

  rr(0, 0, w, h, radius);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, padding, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });

  const spr = new THREE.Sprite(mat);
  const aspect = w / h;
  spr.scale.set(baseScale * aspect, baseScale, 1);
  spr.renderOrder = renderOrder;
  spr.userData._baseOpacity = 1.0;
  return spr;
}

function projectToScreen(vec3, camera, canvas) {
  const v = vec3.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: (v.x * 0.5 + 0.5) * rect.width,
    y: (-v.y * 0.5 + 0.5) * rect.height
  };
}

/**
 * Transported from the modular template:
 * - Use THREE.TetrahedronGeometry as authoritative
 * - Derive the 4 unique vertices
 * - Semantically assign vertices so the default view is stable:
 *    Identity = lowest Y
 *    Trust = upper-left (min X among remaining)
 *    Truth = upper-right (max X among remaining)
 *    Data = remaining vertex (back-ish)
 * - Build faces opposite each semantic vertex with per-face colors.
 */
function buildSemanticTetrahedron(schema) {
  const radius = schema.geometry?.radius ?? 1.0;

  const base = new THREE.TetrahedronGeometry(radius);
  const pos = base.attributes.position;

  // collect unique verts
  const uniq = [];
  const eps = 1e-4;
  const eq = (a, b) =>
    Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;

  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    if (!uniq.some((u) => eq(u, v))) uniq.push(v);
  }
  if (uniq.length !== 4) throw new Error(`Expected 4 unique tetra vertices, got ${uniq.length}`);

  // Assign semantic vertices
  uniq.sort((a, b) => b.y - a.y);
  const vIdentity = uniq[0];

  const remaining = uniq.slice(1);
  remaining.sort((a, b) => a.x - b.x);
  const vTrust = remaining[0];
  const vTruth = remaining[2];
  const vData = remaining[1];

  const V = { Identity: vIdentity, Trust: vTrust, Truth: vTruth, Data: vData };

  const faces = [
    { name: "Identity", verts: ["Trust", "Truth", "Data"] },
    { name: "Trust", verts: ["Identity", "Truth", "Data"] },
    { name: "Truth", verts: ["Identity", "Trust", "Data"] },
    { name: "Data", verts: ["Identity", "Trust", "Truth"] }
  ];

  const positions = [];
  const colors = [];
  const faceMeta = [];

  for (const f of faces) {
    const a = V[f.verts[0]], b = V[f.verts[1]], c = V[f.verts[2]];
    positions.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);

    const centroid = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1/3);
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();

    

    // Ensure face normals point outward (away from origin).
    // For a convex poly centered at the origin, the face centroid vector points outward.
    if (normal.dot(centroid) < 0) normal.negate();
faceMeta.push({ name: f.name, verts: f.verts.slice(), centroid, normal });

    const faceColor = parseColor(schema.labels?.faces?.[f.name]?.color, "#cfd8e3");
    for (let i=0;i<3;i++) colors.push(faceColor.r, faceColor.g, faceColor.b);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.10,
    roughness: 0.60,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: true
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.userData.faceMeta = faceMeta;
  mesh.userData.vertices = V;

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(base),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.10 })
  );

  return { mesh, wire, radius };
}

function applyDefaultView({ camera, controls, object, schema }) {
  const dv = schema.defaultView ?? {};
  camera.fov = dv.camera?.fov ?? 42;
  camera.updateProjectionMatrix();

  const [cx, cy, cz] = dv.camera?.pos ?? [2.2, 2.2, 2.2];
  camera.position.set(cx, cy, cz);

  const [tx, ty, tz] = dv.camera?.target ?? [0, 0, 0];
  controls.target.set(tx, ty, tz);

  const [rx, ry, rz] = dv.objectRotationEuler ?? [0, 0, 0];
  object.rotation.set(rx, ry, rz);

  controls.update();
}

function start(schema) {
  const canvas = $("canvas");
  const status = $("status");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.5;

  scene.add(new THREE.AmbientLight(0xffffff, 0.60));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(5, 6, 7);
  scene.add(key);

  const root = new THREE.Group();
  scene.add(root);

  const { mesh: tetra, wire, radius } = buildSemanticTetrahedron(schema);
  root.add(tetra);
  root.add(wire);

  // Labels
  const faceLabels = new Map();   // name -> { sprite, meta }
  const vertexLabels = new Map(); // name -> sprite

  const faceScale = schema?.labels?.faceScale ?? 0.34;
  const vertexScale = schema?.labels?.vertexScale ?? 0.24;
  const faceInset = (schema?.labels?.faceInset ?? 0.10) * radius;
  const faceLift = (schema?.labels?.faceNormalLift ?? 0.012) * radius;

  for (const f of tetra.userData.faceMeta) {
    const labelText = schema.labels?.faces?.[f.name]?.text ?? f.name.toUpperCase();
    const spr = makeTextSprite(labelText, {
      fontSize: 54,
      bg: "rgba(0,0,0,0.28)",
      baseScale: faceScale,
      renderOrder: 30
    });

    // inset toward origin + tiny lift along normal
    const centroidLen = Math.max(1e-6, f.centroid.length());
    const inward = f.centroid.clone().multiplyScalar(-faceInset / centroidLen);
    spr.position.copy(f.centroid.clone().add(inward).add(f.normal.clone().multiplyScalar(faceLift)));

    root.add(spr);
    faceLabels.set(f.name, { sprite: spr, meta: f });
  }

  for (const [name, v] of Object.entries(tetra.userData.vertices)) {
    const key = schema.labels?.vertices?.[name]?.key ?? name[0];
    const spr = makeTextSprite(key, {
      fontSize: 56,
      bg: "rgba(0,0,0,0.22)",
      baseScale: vertexScale,
      renderOrder: 20
    });
    spr.position.copy(v.clone().multiplyScalar(1.07));
    root.add(spr);
    vertexLabels.set(name, spr);
  }

  applyDefaultView({ camera, controls, object: root, schema });
  if (status) status.textContent = `schema: ${schema.title ?? "loaded"}`;

  // UI
  // Default: slow, steady yaw about the *world* vertical axis (Y).
  // This keeps the tetrahedron "upright" even if the object gets tilted later.
  let spinning = true;
  const clock = new THREE.Clock();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const spinRadPerSec = Number(schema?.spin?.radPerSec ?? 0.25);

  const btnSpin = $("btnSpin");
  if (btnSpin) btnSpin.textContent = "Pause";
  $("btnReset")?.addEventListener("click", () => applyDefaultView({ camera, controls, object: root, schema }));
  btnSpin?.addEventListener("click", () => {
    spinning = !spinning;
    btnSpin.textContent = spinning ? "Pause" : "Spin";
  });

  // Resize
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.floor(rect.width));
    const h = Math.max(2, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // Label policy
  const policy = schema.labelPolicy ?? {};
  const hideBackVertices = policy.hideBackVertices !== false;
  const fadeNearPx = policy.vertexFadeNearFacePx ?? 28;
  const faceDotStart = policy.faceDotStart ?? 0.10;
  const faceDotFull = policy.faceDotFull ?? 0.30;

  // Scratch vectors
  const tmpWorldPos = new THREE.Vector3();
  const tmpWorldCentroid = new THREE.Vector3();
  const tmpToCam = new THREE.Vector3();
  const tmpWorldNormal = new THREE.Vector3();
  const tmpOutward = new THREE.Vector3();
  const tetraWorldQuat = new THREE.Quaternion();

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function animate() {
    requestAnimationFrame(animate);
    // Frame-rate independent world-yaw.
    const dt = clock.getDelta();
    if (spinning) root.rotateOnWorldAxis(WORLD_UP, spinRadPerSec * dt);
    controls.update();

    // Face labels: only front-facing, smooth fade
    root.getWorldQuaternion(tetraWorldQuat);
    const visibleFacePts = [];

    for (const { sprite, meta } of faceLabels.values()) {
      sprite.getWorldPosition(tmpWorldCentroid);

      tmpToCam.subVectors(camera.position, tmpWorldCentroid).normalize();
      tmpWorldNormal.copy(meta.normal).transformDirection(root.matrixWorld).normalize();

      const d = tmpWorldNormal.dot(tmpToCam);
      const t = clamp01((d - faceDotStart) / Math.max(1e-6, (faceDotFull - faceDotStart)));
      const alpha = smoothstep(t);

      sprite.material.opacity = alpha;

      if (alpha > 0.25) visibleFacePts.push(projectToScreen(tmpWorldCentroid, camera, canvas));
    }

    // Vertex labels: hemisphere + yield to faces
    const centerWorld = new THREE.Vector3();
    root.getWorldPosition(centerWorld);
    const viewDir = camera.position.clone().sub(centerWorld).normalize();

    const showVertex = (worldPos) => {
      const vdir = worldPos.clone().sub(centerWorld).normalize();
      return vdir.dot(viewDir) > 0.02;
    };

    for (const spr of vertexLabels.values()) {
      spr.getWorldPosition(tmpWorldPos);

      let visible = true;
      if (hideBackVertices) visible = showVertex(tmpWorldPos);

      if (!visible) {
        spr.material.opacity = 0.0;
        continue;
      }

      const p = projectToScreen(tmpWorldPos, camera, canvas);

      let minD = Infinity;
      for (const fp of visibleFacePts) {
        const dx = p.x - fp.x;
        const dy = p.y - fp.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minD) minD = dist;
      }

      const t = clamp01((minD - fadeNearPx) / (fadeNearPx * 1.2));
      spr.material.opacity = 0.12 + 0.88 * t;
    }

    renderer.render(scene, camera);
  }

  animate();
}

(async function boot() {
  try {
    const schema = await loadSchema();
    await loadTOC(schema);
    start(schema);
  } catch (e) {
    console.error(e);
    const status = $("status");
    if (status) status.textContent = "schema: failed";
    const content = $("content");
    if (content) content.innerHTML = `<p style="color:#ffb4b4;margin:0">Failed to start: ${String(e?.message || e)}</p>`;
  }
})();
