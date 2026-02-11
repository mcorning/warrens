export function makePicker({ THREE, camera, renderer, faceMeshes }){
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(e){
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    ndc.set(x,y);

    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(faceMeshes, false);
    if (!hits.length) return null;

    const obj = hits[0].object;
    const idx = faceMeshes.indexOf(obj);
    return idx >= 0 ? idx : null;
  }

  return { pick };
}
