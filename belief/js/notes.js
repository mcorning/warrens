export function createNotesController({ titleEl, textareaEl, schema }){
  const keyPrefix = "belief_notes_v1:";
  let current = "overview";

  function storageKey(faceId){ return keyPrefix + faceId; }

  function load(faceId){
    const raw = localStorage.getItem(storageKey(faceId));
    if (raw !== null) return raw;
    return schema.notes?.[faceId] ?? "# Notes\n\n";
  }

  function save(faceId, text){
    localStorage.setItem(storageKey(faceId), text);
  }

  function setFace(faceId, label){
    current = faceId;
    titleEl.textContent = `Notes: ${label}`;
    textareaEl.value = load(faceId);
    textareaEl.focus({ preventScroll: true });
  }

  textareaEl.addEventListener('input', ()=>{
    save(current, textareaEl.value);
  });

  // init
  textareaEl.value = load("overview");

  return { setFace };
}
