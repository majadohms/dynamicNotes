// ==================== notiz-proto / src/app.js ====================
// Kein ES-Module nötig. Läuft in Chrome, Edge, Brave, Firefox.
// Lokaler Speicher: localStorage (offline).
// Hintergrund-Backup: POST/GET zu http://localhost:7001/api (Flask).
// ==================================================================

/* -------------------- Konfiguration -------------------- */
const STORAGE_KEY = 'vanilla-blocks-v1';
const API_BASE    = 'http://localhost:7001/api'; // Flask: /save /load

/* -------------------- Utilities -------------------- */
function uid(){ return Math.random().toString(36).slice(2,10); }
function n(x,y,title,note,color){ return { id: uid(), x, y, title, note, color }; }
function randomColor(){
  const p=['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#f87171','#22d3ee'];
  return p[Math.floor(Math.random()*p.length)];
}
function escapeHtml(s){ return String(s||'').replace(/[&<>\"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

/* -------------------- Seed / Storage -------------------- */
function seed(){
  return [
    n(80,80,'Idee','Erste Gedanken…','#60a5fa'),
    n(320,160,'Recherche','Links, Quellen, Zitate','#34d399'),
    n(200,280,'To-Dos','Nächste Schritte als Liste','#fbbf24'),
  ];
}
function loadLocal(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  }catch{ return null; }
}
function saveLocal(arr){
  try{
    if(Array.isArray(arr)) localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }catch{}
}

/* -------------------- Hintergrund-Backup (Flask) -------------------- */
const backgroundSave = debounce(async function(){
  try {
    await fetch(`${API_BASE}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodes),
    });
  } catch(_) { /* Service evtl. aus – egal. */ }
}, 600);

async function loadFromService(){
  try{
    const res = await fetch(`${API_BASE}/load`, { cache:'no-store' });
    if(!res.ok) return;
    const data = await res.json();
    if(Array.isArray(data) && data.length){
      nodes = normalizeArray(data);
      saveLocal(nodes); // auch lokal cachen
    }
  }catch(_){}
}

/* -------------------- State + DOM-Refs -------------------- */
let nodes = null;
let selectedId = null, dragging=null, dx=0, dy=0;

let canvas, form, empty, titleEl, noteEl, colorEl;

/* -------------------- Render & Interaktionen -------------------- */
function render(){
  canvas.innerHTML='';
  if(!Array.isArray(nodes)) nodes = seed();

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

function startDrag(e,node){
  e.preventDefault();
  dragging=node; dx=e.clientX-node.x; dy=e.clientY-node.y;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once:true });
}
function onMove(e){ if(!dragging) return; dragging.x=e.clientX-dx; dragging.y=e.clientY-dy; render(); }
function onUp(){ dragging=null; save(); window.removeEventListener('pointermove', onMove); }

function patch(p){
  const i = nodes.findIndex(n=>n.id===selectedId); if(i<0) return;
  nodes[i] = { ...nodes[i], ...p }; render(); save();
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

/* -------------------- Speichern (lokal + stilles Backup) -------------------- */
function save(){
  //saveLocal(nodes);
  backgroundSave(); // stilles JSON-Backup über Flask-Service
}

/* -------------------- Import / Export (Cross-Browser) -------------------- */
async function saveToFile(){
  const data = JSON.stringify(nodes, null, 2);
  const blob = new Blob([data], { type:'application/json' });

  if('showSaveFilePicker' in window){
    // Moderne Browser (Chromium)
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName:'backup.json',
        types:[{ description:'JSON', accept:{ 'application/json':['.json'] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob); await w.close();
      alert('✅ Backup gespeichert!');
    }catch(e){ /* abgebrochen */ }
  } else {
    // Firefox / Safari – klassischer Download
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='backup.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
}

async function loadFromFile(){
  if('showOpenFilePicker' in window){
    // Moderne Browser
    try{
      const [fh] = await window.showOpenFilePicker({
        types:[{ description:'JSON', accept:{ 'application/json':['.json'] } }],
        multiple:false
      });
      const file = await fh.getFile();
      const text = await file.text();
      applyImportedData(text);
    }catch(e){ /* abgebrochen */ }
  } else {
    // Firefox / Safari – verstecktes <input type=file>
    const input = document.createElement('input');
    input.type='file'; input.accept='application/json';
    input.onchange = (e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      const r=new FileReader();
      r.onload = ()=> applyImportedData(r.result);
      r.readAsText(f);
    };
    input.click();
  }
}

function applyImportedData(text){
  try{
    const data = JSON.parse(text);
    if(Array.isArray(data)){
      nodes = normalizeArray(data);
      render(); save(); select(nodes[0]?.id);
      alert('✅ Backup importiert!');
    } else {
      alert('❌ Ungültige Datei – erwarte ein JSON-Array.');
    }
  }catch{ alert('❌ Fehler beim Lesen der Datei.'); }
}

/* -------------------- Init -------------------- */
function init(){
  // DOM-Refs
  canvas  = document.getElementById('canvas');
  form    = document.getElementById('form');
  empty   = document.getElementById('empty');
  titleEl = document.getElementById('title');
  noteEl  = document.getElementById('note');
  colorEl = document.getElementById('color');

  // Daten laden (Service → lokal → Seed)
  //nodes = loadLocal();
  //if(!Array.isArray(nodes) || nodes.length===0){ nodes = seed(); saveLocal(nodes); }
  // Zusätzlich still aus Service laden (überschreibt, wenn vorhanden)
  loadFromService().then(()=>{ render(); select(nodes[0]?.id); });

  // Erste Darstellung
  render(); select(nodes[0]?.id);

  // Inputs
  ['input','change'].forEach(evt=>{
    titleEl.addEventListener(evt, ()=>patch({ title:titleEl.value }));
    noteEl .addEventListener(evt, ()=>patch({ note: noteEl.value  }));
    colorEl.addEventListener(evt, ()=>patch({ color:colorEl.value }));
  });

  // Buttons
  document.getElementById('addBtn').onclick = ()=>{
    const node = n(120,120,'Neuer Block','', randomColor());
    nodes.push(node); render(); save(); select(node.id);
  };
  document.getElementById('resetBtn').onclick = ()=>{
    if(confirm('Alles zurücksetzen?')){
      nodes = seed(); render(); save(); select(nodes[0]?.id);
    }
  };
  document.getElementById('exportBtn').onclick = saveToFile;

  // Der vorhandene versteckte <input id="importFile"> bleibt:
  const importInput = document.getElementById('importFile');
  if (importInput) {
    // Falls Browser File Picker kann: nutze den, ohne das versteckte Input zu brauchen
    importInput.addEventListener('click', (e)=>{
      if('showOpenFilePicker' in window){
        e.preventDefault();
        loadFromFile();
      }
    });
    // Klassischer Fallback (Label klickt das Input an)
    importInput.onchange = (e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=> applyImportedData(r.result);
      r.readAsText(f); e.target.value='';
    };
  }

  const backupBtn = document.getElementById('backupBtn');
  if (backupBtn) backupBtn.onclick = saveToFile;

  // Canvas: Klick ins Leere schließt Panel
  canvas.addEventListener('click', ()=>{
    selectedId=null; form.style.display='none'; empty.style.display='block';
  });
}

// Starten, wenn DOM bereit
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', init);
}else{
  init();
}


