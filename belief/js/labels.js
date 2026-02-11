import { projectToSolid } from './projection.js';

/**
 * Build DOM label nodes.
 */
export function createLabelNodes(labelsLayer, schema){
  const faceNodes = schema.faces.map(f=>{
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = f.label;
    labelsLayer.appendChild(el);
    return el;
  });

  const vertexTexts = schema.vertices;
  const vertexNodes = vertexTexts.map(t=>{
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = t;
    labelsLayer.appendChild(el);
    return el;
  });

  return { faceNodes, vertexNodes };
}

function vEqual(a,b,eps=1e-4){
  return Math.abs(a.x-b.x)<eps && Math.abs(a.y-b.y)<eps && Math.abs(a.z-b.z)<eps;
}

function faceVerts(pos, faceIndex){
  const base = faceIndex*3;
  const THREE = pos.itemSize ? null : null; // noop
  // caller provides THREE vectors, so we don't instantiate here
}

/**
 * Compute identity-face vertices + apex vertex (local).
 * pos: baseGeometry.attributes.position (non-indexed)
 * THREE: three module
 */
export function computeKeyVertices(pos, THREE){
  const identityFaceIndex = 3;

  const getFaceVerts = (fi)=>{
    const base = fi*3;
    const a = new THREE.Vector3().fromBufferAttribute(pos, base+0);
    const b = new THREE.Vector3().fromBufferAttribute(pos, base+1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, base+2);
    return [a,b,c];
  };

  const identityVertsLocal = getFaceVerts(identityFaceIndex);

  // apex: first vertex not on identity face
  let apexVertLocal = null;
  for (let i=0; i<pos.count; i++){
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const inIdentity = identityVertsLocal.some(iv=>vEqual(iv, v, 1e-4));
    if (!inIdentity){ apexVertLocal = v; break; }
  }

  // map each identity vertex to process label based on adjacent faces
  const faceNames = ["Data","Truth","Trust","Identity"];

  const facesContainingVertex = (vLocal)=>{
    const faces=[];
    for (let f=0; f<4; f++){
      if (f===identityFaceIndex) continue;
      const vs = getFaceVerts(f);
      if (vs.some(x=>vEqual(x, vLocal, 1e-4))) faces.push(faceNames[f]);
    }
    return faces;
  };

  const identityVertexToProcess = new Map();
  for (const v of identityVertsLocal){
    const faces = facesContainingVertex(v);
    const hasData  = faces.includes("Data");
    const hasTruth = faces.includes("Truth");
    const hasTrust = faces.includes("Trust");
    let label = "Probability";
    if (hasData && hasTruth) label = "Likelihood";
    if (hasTruth && hasTrust) label = "Evidence";
    if (hasData && hasTrust) label = "Probability";
    identityVertexToProcess.set(v, label);
  }

  return { identityFaceIndex, identityVertsLocal, apexVertLocal, identityVertexToProcess };
}

export function computeFaceMath(pos, THREE){
  const faceCentroid = (i)=>{
    const base=i*3;
    const a=new THREE.Vector3().fromBufferAttribute(pos, base+0);
    const b=new THREE.Vector3().fromBufferAttribute(pos, base+1);
    const c=new THREE.Vector3().fromBufferAttribute(pos, base+2);
    return a.add(b).add(c).multiplyScalar(1/3);
  };
  const faceNormal = (i)=>{
    const base=i*3;
    const a=new THREE.Vector3().fromBufferAttribute(pos, base+0);
    const b=new THREE.Vector3().fromBufferAttribute(pos, base+1);
    const c=new THREE.Vector3().fromBufferAttribute(pos, base+2);
    return b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  };
  return {
    faceCentroidsLocal:[0,1,2,3].map(faceCentroid),
    faceNormalsLocal:[0,1,2,3].map(faceNormal),
  };
}

/**
 * Update face + vertex label positions and visibility.
 * Hides vertex labels when the vertex is on the far hemisphere relative to camera.
 */
export function updateLabels({
  THREE,
  camera,
  tetra,
  selectedFaceIndex, // null or 0..3
  faceNodes,
  vertexNodes,
  faceCentroidsLocal,
  faceNormalsLocal,
  keyVerts,
}){
  const tmpWorldPos = new THREE.Vector3();
  const tmpWorldNormal = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const tetraWorldQuat = new THREE.Quaternion();

  // --- face labels ---
  const FRONT_DOT_THRESHOLD = 0.15;
  tetra.getWorldQuaternion(tetraWorldQuat);

  for (let i=0; i<4; i++){
    const el = faceNodes[i];

    if (selectedFaceIndex !== null && i !== selectedFaceIndex){
      el.style.display='none';
      continue;
    }

    tmpWorldPos.copy(faceCentroidsLocal[i]);
    tetra.localToWorld(tmpWorldPos);

    const { x, y } = projectToSolid(tmpWorldPos, camera);

    if (selectedFaceIndex !== null && i === selectedFaceIndex){
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      el.style.display='block';
      continue;
    }

    tmpWorldNormal.copy(faceNormalsLocal[i]).applyQuaternion(tetraWorldQuat).normalize();
    camDir.copy(camera.position).sub(tmpWorldPos).normalize();
    const dot = tmpWorldNormal.dot(camDir);

    if (dot > FRONT_DOT_THRESHOLD){
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      el.style.display='block';
    } else {
      el.style.display='none';
    }
  }

  // --- vertex labels ---
  // Visibility test: a vertex is "front" if it lies in the camera-facing hemisphere about tetra center.
  const centerWorld = new THREE.Vector3();
  tetra.getWorldPosition(centerWorld);
  const viewDir = camera.position.clone().sub(centerWorld).normalize();

  const showVertex = (worldPos)=>{
    const vdir = worldPos.clone().sub(centerWorld).normalize();
    return vdir.dot(viewDir) > 0.02; // small bias to reduce flicker
  };

  // hide all by default
  vertexNodes.forEach(n=>n.style.display='none');

  // when selecting a face: show only vertices that belong to selected face (3 verts), and only if front.
  // otherwise: show all front vertices (apex + three base)
  const showAll = selectedFaceIndex === null;

  // Belief at apex is vertexNodes[0]
  if (keyVerts.apexVertLocal){
    tmpWorldPos.copy(keyVerts.apexVertLocal);
    tetra.localToWorld(tmpWorldPos);

    const visible = showAll ? showVertex(tmpWorldPos) : (
      // apex is not part of identity face; it's part of the other 3 faces
      selectedFaceIndex !== keyVerts.identityFaceIndex && showVertex(tmpWorldPos)
    );

    if (visible){
      const { x, y } = projectToSolid(tmpWorldPos, camera);
      const el = vertexNodes[0];
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      el.style.display='block';
    }
  }

  // three identity vertices mapped to Likelihood/Evidence/Probability
  for (const vLocal of keyVerts.identityVertsLocal){
    tmpWorldPos.copy(vLocal);
    tetra.localToWorld(tmpWorldPos);

    if (!showVertex(tmpWorldPos)) continue;

    // In selection mode, only show if that vertex belongs to selected face.
    if (!showAll){
      // selected identity face index shows all three identity vertices.
      if (selectedFaceIndex === keyVerts.identityFaceIndex){
        // ok
      } else {
        // other face contains exactly two of the three identity vertices. We'll compute membership by geometry equality against face mesh positions.
        // To keep this cheap, we accept a slightly looser rule: hide process vertices unless identity face is selected.
        continue;
      }
    }

    const label = keyVerts.identityVertexToProcess.get(vLocal) || 'Probability';
    const nodeIndex = label === 'Likelihood' ? 1 : (label === 'Evidence' ? 2 : 3);
    const el = vertexNodes[nodeIndex];

    const { x, y } = projectToSolid(tmpWorldPos, camera);
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    el.style.display='block';
  }
}
