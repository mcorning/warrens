import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export function createSolid(schema){
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const DEFAULT_CAM_POS = new THREE.Vector3(2.2, 2.2, 2.2);
  camera.position.copy(DEFAULT_CAM_POS);
  camera.lookAt(0,0,0);

  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(5,6,7);
  scene.add(dir);

  // Geometry (authoritative)
  const baseGeometry = new THREE.TetrahedronGeometry(1);
  const pos = baseGeometry.attributes.position;

  const tetra = new THREE.Group();
  scene.add(tetra);

  const faceMeshes = [];
  for (let f=0; f<4; f++){
    const faceGeom = new THREE.BufferGeometry();

    const faceVerts = new Float32Array(9);
    const base = f*3;
    for (let v=0; v<3; v++){
      faceVerts[v*3+0] = pos.getX(base+v);
      faceVerts[v*3+1] = pos.getY(base+v);
      faceVerts[v*3+2] = pos.getZ(base+v);
    }
    faceGeom.setAttribute('position', new THREE.BufferAttribute(faceVerts, 3));

    const c = new THREE.Color(schema.faces[f].color);
    const cols = new Float32Array([c.r,c.g,c.b, c.r,c.g,c.b, c.r,c.g,c.b]);
    faceGeom.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    faceGeom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors:true,
      roughness:0.35,
      metalness:0.0,
      side:THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(faceGeom, mat);
    tetra.add(mesh);
    faceMeshes.push(mesh);
  }

  // wireframe scaffold
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(baseGeometry),
    new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.08 })
  );
  tetra.add(wire);

  return { THREE, scene, camera, renderer, tetra, faceMeshes, baseGeometry, pos, DEFAULT_CAM_POS };
}
