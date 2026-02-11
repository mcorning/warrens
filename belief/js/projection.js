export const solidRect = { left: 0, top: 0, width: 1, height: 1 };

export function refreshSolidRect(solidWrap){
  const r = solidWrap.getBoundingClientRect();
  solidRect.left = r.left;
  solidRect.top = r.top;
  solidRect.width = r.width || 1;
  solidRect.height = r.height || 1;
}

/**
 * Project a world-space vector to page pixel coords aligned to solidWrap.
 * Returns {x, y, zNdc} where zNdc is NDC z (for clipping awareness).
 */
export function projectToSolid(worldVec3, camera){
  const projected = worldVec3.clone().project(camera);
  const x = solidRect.left + (projected.x * 0.5 + 0.5) * solidRect.width;
  const y = solidRect.top  + (-projected.y * 0.5 + 0.5) * solidRect.height;
  return { x, y, zNdc: projected.z };
}
