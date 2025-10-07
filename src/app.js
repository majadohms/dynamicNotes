// ==================== notiz-proto — SERVER ONLY STORAGE ====================
// Lädt nur vom Server (GET /api/load)
// Speichert nur zum Server (POST /api/save), debounced
// Optional: Git-Push beim Schließen via /api/push (falls im Backend vorhanden)
// Keine lokale Persistenz, keine Downloads
// ===========================================================================

/* --- Konfiguration --- */
const API_BASE = "http://localhost:7001/api"; // Flask-Backend: /load, /save, (optional) /push

/* --- Utils --- */
function uid(){ return Math.random().toString(36).slice(2,10); }
function n(x,y,title,note,color){ return { id: uid(), x, y, title, note, color }; }
function randomColor(){
  const p=['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#f87171','#22d3ee'];
  return p[Math.floor(Math.random()*p.length)];
}
function escapeHtml(s){ return String(s||'').replace(/[&<>\"']/g, c=>({"&":"&amp;","<":"&lt;","&gt;":">&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/* --- Server-API --- */
async function apiLoad(){
  const res = await fetch(`${API_BASE}/load`, { cache: 'no-store' });
  if(!res.ok) throw new Error('load failed');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function apiSave(data){
  const res = await fetch(`${API_BASE}/save`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(data),
  });
  if(!res.ok) throw new Error('save failed');
}
async function apiPush(){
  // optionaler Endpoint im Backend; wenn nicht vorhanden, ignorieren
  try {
    await fetch(`${API_BASE}/push`, { method:'POST', keepalive:true });
  } catch {}
}

/* --- State + DOM --- */
let nodes = [];
let selectedId = null, dragging=null, dx=0, dy=0;
let canvas, form, empty, titleEl, noteEl, colorEl;

/* --- Seed --- */
function seed(){
  return [
    n(80,80,'Idee','Erste Gedanken…','#60a5fa'),
    n(320,160,'Recherche','Links, Quellen, Zitate','#34d399'),
    n(200,280,'To-Dos','Nächste Schritte als Liste','#fbbf24'),
  ];
}

function normalizeArray(arr){
  return arr.map(n=>({
    id: n.id || uid(),
    x: Number(n.x)||0,
    y: Number(n.y)||0,
    title: String(n.title||''),
    note:  String(n.note ||''),
    color: String(n.color||randomColor()),
  }));
}

/* --- Rendering --- */
function render(){
  canvas.innerHTML='';
  nodes.forEach(node=>{
    const el=document.createElement('div');
    el.className='block';
    el.style.left=node.x+'px';
    el.style.top =node.y+'px';
    el.style.background=node.color;
    el.dataset.id=node.id;
    el.innerHTML=`<h4>${escapeHtml(node.title||'Untitled')}</h4><p>${escapeHtml((node.note||'').slice(0,120))}</p>`;
    el.addEventListener('pointerdown', e=>startDrag(e,node));
    el.addEventListener('click', e=>{ e.stopPropagation(); select(node.id); });
    canvas.appendChild(el);
  });
}

function select(id){
  selectedId=id;
  const node = nodes.find(n=>n.id===id);
  if(!node){ form.style.display='none'; empty.style.display='block'; return; }
  form.style.display='block'; empty.style.display='none';
  titleEl.value=node.title||'';
  noteEl.value =node.note ||'';
  colorEl.value=node.color||'#60a5fa';
}

/* --- Drag & Drop --- */
function startDrag(e,node){
  e.preventDefault();
  dragging=node; dx=e.clientX-node.x; dy=e.clientY-node.y;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once:true });
}
function onMove(e){ if(!dragging) return; dragging.x=e.clientX-dx; dragging.y=e.clientY-dy; render(); }
function onUp(){ dragging=null; save(); window.removeEventListener('pointermove', onMove); }

/* --- Patch + Save --- */
function patch(p){
  const i = nodes.findIndex(n=>n.id===selectedId); if(i<0) return;
  nodes[i] = { ...nodes[i], ...p }; render(); save();
}

const saveDebounced = debounce(async ()=>{
  try { await apiSave(nodes); }
  catch (e) { console.warn('Server-Speichern fehlgeschlagen:', e); }
}, 600);

function save(){ saveDebounced(); }

/* --- Beacons beim Schließen: letztes Save + (optional) Push --- */
function beaconSaveAndPush() {
  try {
    const json = JSON.stringify(nodes || []);
    // 1) Save (sendBeacon bis ~64 KB; sonst keepalive-Fetch)
    if (("sendBeacon" in navigator) && json.length < 60000) {
      const blob = new Blob([json], { type: "application/json" });
      navigator.sendBeacon(`${API_BASE}/save`, blob);
    } else {
      fetch(`${API_BASE}/save`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: json, keepalive: true
      }).catch(()=>{});
    }
    // 2) Push (wenn Route existiert)
    if ("sendBeacon" in navigator) {
      navigator.sendBeacon(`${API_BASE}/push`, new Blob([], { type: "application/octet-stream" }));
    } else {
      fetch(`${API_BASE}/push`, { method:"POST", keepalive:true }).catch(()=>{});
    }
  } catch {}
}
window.addEventListener("pagehide", beaconSaveAndPush);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") beaconSaveAndPush();
});
// optional zusätzlich:
window.addEventListener("beforeunload", beaconSaveAndPush);

/* --- Init --- */
async function init(){
  // DOM
  canvas  = document.getElementById('canvas');
  form    = document.getElementById('form');
  empty   = document.getElementById('empty');
  titleEl = document.getElementById('title');
  noteEl  = document.getElementById('note');
  colorEl = document.getElementById('color');

  // Server-Zustand laden; wenn leer → Seeds anlegen & sofort speichern
  try {
    nodes = await apiLoad();
  } catch {
    nodes = [];
  }
  if (!Array.isArray(nodes) || nodes.length === 0) {
    nodes = seed();
    try { await apiSave(nodes); } catch(e){ console.warn('Initiales Save fehlgeschlagen:', e); }
  }

  render();
  select(nodes[0]?.id);

  // Inputs
  ['input','change'].forEach(evt=>{
    titleEl.addEventListener(evt, ()=>patch({ title:titleEl.value }));
    noteEl .addEventListener(evt, ()=>patch({ note: noteEl.value  }));
    colorEl.addEventListener(evt, ()=>patch({ color:colorEl.value }));
  });

  // Buttons (nur verbinden, wenn vorhanden)
  const addBtn = document.getElementById('addBtn');
  addBtn && (addBtn.onclick = ()=>{
    const node = n(120,120,'Neuer Block','', randomColor());
    nodes.push(node); render(); save(); select(node.id);
  });

  const resetBtn = document.getElementById('resetBtn');
  resetBtn && (resetBtn.onclick = async ()=>{
    if(confirm('Alles zurücksetzen?')){
      nodes = seed(); render();
      try { await apiSave(nodes); } catch(e){ console.warn('Reset-Save fehlgeschlagen:', e); }
      select(nodes[0]?.id);
    }
  });

  const closePanel = document.getElementById('closePanel');
  closePanel && (closePanel.onclick = ()=>{
    selectedId=null; form.style.display='none'; empty.style.display='block';
  });

  const delBtn = document.getElementById('deleteBtn');
  delBtn && (delBtn.onclick = ()=>{
    if(!selectedId) return;
    nodes = nodes.filter(n=>n.id!==selectedId);
    selectedId=null; render(); save();
    form.style.display='none'; empty.style.display='block';
  });

  // Canvas-Klick schließt Panel
  canvas.addEventListener('click', ()=>{
    selectedId=null; form.style.display='none'; empty.style.display='block';
  });

  // (Falls noch Export/Import/Backup-Buttons im HTML existieren, deaktivieren wir sie)
  const exportBtn = document.getElementById('exportBtn');
  const backupBtn = document.getElementById('backupBtn');
  const importInput = document.getElementById('importFile');
  [exportBtn, backupBtn, importInput].forEach(el=>{
    if (!el) return;
    el.disabled = true;
    el.title = 'Deaktiviert: Server-only Speicher aktiv';
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
  });
}

// Starten wenn DOM bereit
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', init);
}else{
  init();
}
