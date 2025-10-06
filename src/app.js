const STORAGE_KEY = 'vanilla-blocks-v1';
let installEvent = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  document.getElementById('installBtn').style.display = 'inline-block';
});

// Service Worker relativ (wir haben <base href="/notiz-proto/"> gesetzt)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}


let nodes = load() || [
  n(80,80,'Idee','Erste Gedanken…','#60a5fa'),
  n(320,160,'Recherche','Links, Quellen, Zitate','#34d399'),
  n(200,280,'To-Dos','Nächste Schritte als Liste','#fbbf24')
];
let selectedId = null; let dragging = null; let dragDX=0, dragDY=0;

const canvas = document.getElementById('canvas');
const form = document.getElementById('form');
const empty = document.getElementById('empty');
const titleEl = document.getElementById('title');
const noteEl = document.getElementById('note');
const colorEl = document.getElementById('color');

// Install-Button
const installBtn = document.getElementById('installBtn');
installBtn?.addEventListener('click', async () => {
  try { await installEvent.prompt(); } catch(_) {}
  installEvent = null; installBtn.style.display = 'none';
});

function n(x,y,title,note,color){ return { id: uid(), x, y, title, note, color } }
function uid(){ return Math.random().toString(36).slice(2,10) }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes)) }
function load(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null') }catch{ return null } }

function render(){
  canvas.innerHTML = '';
  nodes.forEach(node => {
    const el = document.createElement('div');
    el.className = 'block';
    el.style.left = node.x + 'px';
    el.style.top  = node.y + 'px';
    el.style.background = node.color;
    el.dataset.id = node.id;
    el.innerHTML = `<h4>${escapeHtml(node.title||'Untitled')}</h4><p>${escapeHtml((node.note||'').slice(0,120))}</p>`;
    el.addEventListener('pointerdown', e => startDrag(e, node));
    el.addEventListener('click', e => { e.stopPropagation(); select(node.id) });
    canvas.appendChild(el);
  });
}

function select(id){
  selectedId = id; const node = nodes.find(n=>n.id===id);
  if(!node){ form.style.display='none'; empty.style.display='block'; return }
  form.style.display='block'; empty.style.display='none';
  titleEl.value = node.title; noteEl.value = node.note; colorEl.value = node.color;
}

function startDrag(e,node){
  e.preventDefault(); dragging = node; dragDX = e.clientX - node.x; dragDY = e.clientY - node.y;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once:true });
}
function onMove(e){ if(!dragging) return; dragging.x = e.clientX - dragDX; dragging.y = e.clientY - dragDY; render(); }
function onUp(){ dragging=null; save(); window.removeEventListener('pointermove', onMove); }

// Panel form bindings
['input','change'].forEach(evt=>{
  titleEl.addEventListener(evt,()=> patch({ title: titleEl.value }));
  noteEl.addEventListener(evt,()=> patch({ note: noteEl.value }));
  colorEl.addEventListener(evt,()=> patch({ color: colorEl.value }));
});
function patch(p){
  const i = nodes.findIndex(n=>n.id===selectedId); if(i<0) return;
  nodes[i] = { ...nodes[i], ...p }; render(); save();
}

// Topbar buttons
function download(filename, text) {
  const a = document.createElement('a');
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  a.setAttribute('download', filename);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

document.getElementById('addBtn').onclick = ()=>{ const node = n(120,120,'Neuer Block','', randomColor()); nodes.push(node); render(); save(); select(node.id) };
document.getElementById('resetBtn').onclick = ()=>{ if(confirm('Alles zurücksetzen?')){ localStorage.removeItem(STORAGE_KEY); nodes=[]; location.reload() } };
document.getElementById('exportBtn').onclick = ()=>{ download('graph.json', JSON.stringify(nodes, null, 2)); };
document.getElementById('importFile').onchange = (e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ const data=JSON.parse(r.result); if(Array.isArray(data)){ nodes=data; render(); save(); } else alert('Ungültiges JSON'); }catch{ alert('JSON-Fehler') } }; r.readAsText(f); e.target.value=''; };
document.getElementById('closePanel').onclick = ()=>{ selectedId=null; form.style.display='none'; empty.style.display='block' };
document.getElementById('deleteBtn').onclick = ()=>{ if(!selectedId) return; nodes = nodes.filter(n=>n.id!==selectedId); selectedId=null; render(); save(); form.style.display='none'; empty.style.display='block' };

// Helpers
function randomColor(){ const p=['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#f87171','#22d3ee']; return p[Math.floor(Math.random()*p.length)] }
function escapeHtml(s){ return s.replace(/[&<>\"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])) }

// Init
render(); select(nodes[0]?.id);
canvas.addEventListener('click', ()=>{ selectedId=null; form.style.display='none'; empty.style.display='block' });

