import { useState, useMemo, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
apiKey: "AIzaSyAAW-KbrhHIzDyRTgmVjlzPa7TK8o9FeI4",
authDomain: "app-sala-control.firebaseapp.com",
projectId: "app-sala-control",
storageBucket: "app-sala-control.firebasestorage.app",
messagingSenderId: "622611612673",
appId: "1:622611612673:web:4200dcddc50292908c2c00"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- UTILIDADES ---
function simpleHash(str) {
let h = 0x811c9dc5;
for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
return h.toString(16);
}

const THEMES = {
dark: { bg: "#080F1E", card: "#0D1526", text: "#CBD5E1", title: "#FFFFFF", border: "#1E2D45", sub: "#475569", accent: "#34D399" },
light: { bg: "#F1F5F9", card: "#FFFFFF", text: "#334155", title: "#0F172A", border: "#CBD5E1", sub: "#64748B", accent: "#059669" }
};

const CYCLE = [
["M", "M", "D", "D", "N", "N", "N"],
["D", "D", "M", "M", "D", "D", "D"],
["N", "N", "D", "D", "M", "M", "M"],
["D", "D", "N", "N", "D", "D", "D"],
];
const CYCLE_LEN = 28;

const ABSENCE = {
VA: { label: "Vacaciones", icon: "🌴", color: "#10B981" },
EN: { label: "Entrenamiento", icon: "📖", color: "#A78BFA" },
BA: { label: "Baja", icon: "🤒", color: "#F87171" }
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW_S = ["L", "M", "X", "J", "V", "S", "D"];
const TURNO_DEF = { M: { color: "#F59E0B" }, N: { color: "#818CF8" }, D: { color: "#64748B" } };

const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const dow = (y, m, d) => { const r = new Date(y, m, d).getDay(); return r === 0 ? 6 : r - 1; };
const dse = (y, m, d) => Math.round((new Date(y, m, d) - new Date(1970, 0, 1)) / 86400000);
const mk = (y, m, d) => `${y}-${m}-${d}`;

function cshift(y, m, d, off = 0) {
const pos = ((dse(y, m, d) + off) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
return CYCLE[Math.floor(pos / 7)][pos % 7];
}

// --- MOTOR DE EQUIDAD TOTAL ---
function autoAssign(ops, targetYear, off) {
// Acumuladores anuales para balanceo
const hSC_Anual = {}, nSC_Anual = {}, historialParejas = {};
ops.forEach(o => {
hSC_Anual[o.id] = 0; nSC_Anual[o.id] = 0; historialParejas[o.id] = {};
ops.forEach(other => { if(o.id !== other.id) historialParejas[o.id][other.id] = 0; });
});

let currentPair = [];
let blockCounter = 0;
const assignments = {};

for (let year = 2024; year <= targetYear; year++) {
assignments[year] = {};
for (let mo = 0; mo < 12; mo++) {
for (let d = 1; d <= dim(year, mo); d++) {
const k = mk(year, mo + 1, d), turno = cshift(year, mo, d, off);
assignments[year][k] = {};

if (turno === "D") {
ops.forEach(op => { assignments[year][k][op.id] = "D"; });
continue;
}

// 1. Verificar Racha (Máximo 4 días)
const getRacha = (id) => {
let r = 0;
for (let i = 1; i <= 4; i++) {
const prev = new Date(year, mo, d - i);
const pk = mk(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
if (assignments[prev.getFullYear()]?.[pk]?.[id] === "SC") r++; else break;
}
return r;
};

const currentPairInvalid = currentPair.some(id => ops.find(o => o.id === id)?.calendar?.[k] || getRacha(id) >= 4);

// 2. Selección de Pareja (Si toca cambio o el actual no puede seguir)
if (blockCounter >= 4 || currentPair.length < 2 || currentPairInvalid) {

// Candidatos disponibles (No ausencia + No racha límite)
let candidates = ops.filter(op => !op.calendar?.[k] && getRacha(op.id) < 4);

// Fallback: Si no hay suficientes, ignoramos racha (Prioridad: Cobertura de 2 personas)
if (candidates.length < 2) candidates = ops.filter(op => !op.calendar?.[k]);

let bestPair = [], minPenalty = Infinity;

// Fuerza bruta sobre todas las combinaciones posibles de parejas
for (let i = 0; i < candidates.length; i++) {
for (let j = i + 1; j < candidates.length; j++) {
const p1 = candidates[i], p2 = candidates[j];

// CÁLCULO DE PENALIZACIÓN (A menor penalización, más equitativo es el turno)
let penalty = (hSC_Anual[p1.id] + hSC_Anual[p2.id]); // Regla 6: Horas anuales
penalty += (nSC_Anual[p1.id] + nSC_Anual[p2.id]) * 100; // Regla 1: Noches (peso alto)
penalty += (historialParejas[p1.id][p2.id] || 0) * 50; // Regla 5: Rotación de parejas

// Penalizar si alguien trabajó ayer (Enfriamiento)
const ayerK = mk(new Date(year, mo, d-1).getFullYear(), new Date(year, mo, d-1).getMonth()+1, new Date(year, mo, d-1).getDate());
if (assignments[year]?.[ayerK]?.[p1.id] === "SC") penalty += 20;
if (assignments[year]?.[ayerK]?.[p2.id] === "SC") penalty += 20;

if (penalty < minPenalty) { minPenalty = penalty; bestPair = [p1.id, p2.id]; }
}
}
currentPair = bestPair;
blockCounter = 0;
}

// 3. Asignación y Contabilidad
ops.forEach(op => {
const abs = op.calendar?.[k];
if (abs) {
assignments[year][k][op.id] = abs;
// Regla 4: Bajas no penalizan (suman como si estuvieran en SC para mantener equidad alta)
if (abs === "BA") { hSC_Anual[op.id] += 12; if (turno === "N") nSC_Anual[op.id]++; }
} else if (currentPair.includes(op.id)) {
assignments[year][k][op.id] = "SC";
hSC_Anual[op.id] += 12;
if (turno === "N") nSC_Anual[op.id]++;
} else {
assignments[year][k][op.id] = "CA";
}
});

if (currentPair.length === 2) {
historialParejas[currentPair[0]][currentPair[1]]++;
historialParejas[currentPair[1]][currentPair[0]]++;
}
blockCounter++;
}
}
}
return assignments[targetYear] || {};
}

// --- RESTO DE LA LÓGICA DE UI (Sin cambios para no romper nada) ---
function computeStats(ops, year, asgn, off) {
return ops.map(op => {
let sc = 0, nSC = 0;
for (let mo = 0; mo < 12; mo++) for (let d = 1; d <= dim(year, mo); d++) {
const k = mk(year, mo + 1, d), t = cshift(year, mo, d, off), a = asgn[k]?.[op.id];
if (t !== "D" && a === "SC") { sc++; if (t === "N") nSC++; }
}
return { ...op, sc, nSC, hSC: sc * 12 };
});
}

const Av = ({ name, color, size = 24 }) => (
<div style={{ width: size, height: size, borderRadius: 8, background: color || '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: '#000', fontWeight: 'bold' }}>
{name?.substring(0, 2).toUpperCase()}
</div>
);

const EyeIcon = ({ visible, color }) => (
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
{visible ? (<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>) : (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>)}
</svg>
);

export default function App() {
const today = new Date();
const [session, setSession] = useState(null);
const [admins, setAdmins] = useState([{ user: "admin", passHash: simpleHash("admin1234"), role: "superadmin" }]);
const [ops, setOps] = useState([]);
const [off, setOff] = useState(-11);
const [view, setView] = useState("calendar");
const [activeYear, setAY] = useState(today.getFullYear());
const [month, setMonth] = useState(today.getMonth());
const [themeMode, setThemeMode] = useState('dark');
const [showConfigPass, setShowConfigPass] = useState(false);

useEffect(() => {
onValue(ref(db, 'ops'), (s) => { if (s.val()) setOps(s.val()); });
onValue(ref(db, 'admins'), (s) => { if (s.val()) setAdmins(s.val()); });
onValue(ref(db, 'offset'), (s) => { if (s.val() !== null) setOff(s.val()); });
}, []);

const saveOps = (n) => set(ref(db, 'ops'), n);
const saveAdmins = (n) => set(ref(db, 'admins'), n);
const saveOff = (n) => set(ref(db, 'offset'), n);

const t = THEMES[themeMode];
const isSuper = session?.role === "superadmin";
const isAdmin = isSuper || session?.role === "admin";
const canEdit = isAdmin || session?.role === "editor";

const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

return (
<div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace' }}>
<header style={{ background: t.card, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center' }}>
<span style={{ fontWeight: 800, color: t.accent }}>SALA DE CONTROL ☁️</span>
<div style={{ display: 'flex', gap: 10 }}>
<button onClick={() => setView("calendar")} style={{ background: 'none', border: 'none', color: view === 'calendar' ? t.accent : t.sub, cursor: 'pointer', fontWeight: 'bold' }}>CALENDARIO</button>
<button onClick={() => setView("stats")} style={{ background: 'none', border: 'none', color: view === 'stats' ? t.accent : t.sub, cursor: 'pointer', fontWeight: 'bold' }}>EQUIDAD</button>
{canEdit && <button onClick={() => setView("editor")} style={{ background: 'none', border: 'none', color: view === 'editor' ? t.accent : t.sub, cursor: 'pointer', fontWeight: 'bold' }}>INCIDENCIAS</button>}
{isAdmin && <button onClick={() => setView("config")} style={{ background: 'none', border: 'none', color: view === 'config' ? t.accent : t.sub, cursor: 'pointer', fontWeight: 'bold' }}>CONFIG</button>}
<button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}>SALIR</button>
</div>
</header>

<main style={{ padding: 20 }}>
{view === "calendar" && (
<div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, overflowX: 'auto' }}>
<div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: 20, alignItems: 'center' }}>
<button onClick={() => { if(month===0){setMonth(11); setAY(v=>v-1)} else setMonth(m=>m-1) }} style={{ padding: '8px 16px', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4 }}>ANT</button>
<h2 style={{ margin: 0, minWidth: 200, textAlign: 'center' }}>{MONTHS[month]} {activeYear}</h2>
<button onClick={() => { if(month===11){setMonth(0); setAY(v=>v+1)} else setMonth(m=>m+1) }} style={{ padding: '8px 16px', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4 }}>SIG</button>
</div>
<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
<thead>
<tr>
<th style={{ padding: 10, borderBottom: `2px solid ${t.border}`, position: 'sticky', left: 0, background: t.card }}>OPERADOR</th>
{Array.from({ length: dim(activeYear, month) }).map((_, i) => (
<th key={i} style={{ padding: 5, borderBottom: `2px solid ${t.border}`, minWidth: 30, color: dow(activeYear, month, i+1) >= 5 ? '#EF4444' : t.sub }}>
{i+1}<br/><small>{DOW_S[dow(activeYear, month, i+1)]}</small>
</th>
))}
</tr>
</thead>
<tbody>
{ops.map(op => (
<tr key={op.id}>
<td style={{ padding: '8px 15px', borderBottom: `1px solid ${t.border}`, position: 'sticky', left: 0, background: t.card, fontWeight: 'bold' }}>{op.name}</td>
{Array.from({ length: dim(activeYear, month) }).map((_, i) => {
const dk = mk(activeYear, month+1, i+1), turn = asgn[dk]?.[op.id];
const rot = cshift(activeYear, month, i+1, off);
let bg = 'transparent', color = t.text;
if (ABSENCE[turn]) { bg = ABSENCE[turn].color; color = '#000'; }
else if (turn === 'SC') { bg = '#34D39922'; color = '#34D399'; }
else if (rot !== 'D') { color = TURNO_DEF[rot].color; }
return <td key={i} style={{ padding: 5, textAlign: 'center', borderBottom: `1px solid ${t.border}`, background: bg, color, fontWeight: turn === 'SC' || rot !== 'D' ? 'bold' : 'normal' }}>{turn}</td>;
})}
</tr>
))}
</tbody>
</table>
</div>
)}

{view === "stats" && (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
{stats.map(s => (
<div key={s.id} style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
<h3 style={{ margin: '0 0 10px 0', color: t.accent }}>{s.name}</h3>
<div style={{ fontSize: 24, fontWeight: 800 }}>{s.sc} turnos SC</div>
<p style={{ color: t.sub }}>{s.hSC} Horas / {s.nSC} Noches en SC</p>
</div>
))}
</div>
)}

{view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} canEdit={canEdit} />}

{view === "config" && isAdmin && (
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
<div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
<h3>OPERADORES</h3>
<input id="newOp" placeholder="Nuevo nombre..." style={{ padding: 8, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4, width: '70%' }} />
<button onClick={() => { const n = document.getElementById('newOp').value; if(n){saveOps([...ops, {id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {}}]); document.getElementById('newOp').value=''} }} style={{ padding: 8, background: t.accent, border: 'none', borderRadius: 4, marginLeft: 5 }}>AÑADIR</button>
<div style={{ marginTop: 20 }}>
{ops.map(o => <div key={o.id} style={{ padding: 5, borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between' }}>{o.name} <button onClick={() => saveOps(ops.filter(x=>x.id!==o.id))} style={{ color: '#EF4444', border: 'none', background: 'none' }}>Eliminar</button></div>)}
</div>
</div>
<div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
<h3>OFFSET CICLO: {off}</h3>
<input type="number" value={off} onChange={e => saveOff(Number(e.target.value))} style={{ padding: 8, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4, width: '100%' }} />
</div>
</div>
)}
</main>
</div>
);
}

function EditorComponent({ ops, saveOps, activeYear, theme: t, canEdit }) {
const [selOp, setSelOp] = useState(ops[0]?.id);
const [selType, setSelType] = useState("VA");
const toggle = (k) => {
if(!canEdit) return;
const n = ops.map(o => {
if(o.id !== selOp) return o;
const c = {...(o.calendar||{})};
c[k] === selType ? delete c[k] : c[k] = selType;
return {...o, calendar: c};
});
saveOps(n);
};

return (
<div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
<select value={selOp} onChange={e=>setSelOp(Number(e.target.value))} style={{ padding: 10, background: t.bg, color: t.text, width: '100%', marginBottom: 20 }}>
{ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
</select>
<div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
{Object.keys(ABSENCE).map(k => <button key={k} onClick={()=>setSelType(k)} style={{ padding: 10, background: selType === k ? ABSENCE[k].color : t.bg, color: selType===k ? '#000' : t.text, border: `1px solid ${t.border}`, borderRadius: 8 }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>)}
</div>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
{MONTHS.map((m, mi) => (
<div key={mi} style={{ background: t.bg, padding: 10, borderRadius: 8 }}>
<div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 10, marginBottom: 5 }}>{m.toUpperCase()}</div>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
{Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
const k = mk(activeYear, mi+1, di+1);
const active = ops.find(o=>o.id===selOp)?.calendar?.[k];
return <div key={di} onClick={()=>toggle(k)} style={{ height: 20, background: active ? ABSENCE[active].color : t.card, borderRadius: 2, fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{di+1}</div>;
})}
</div>
</div>
))}
</div>
</div>
);
}

function LoginScreen({ admins, onLogin, theme: t }) {
const [u, setU] = useState(""), [p, setP] = useState(""), [show, setShow] = useState(false);
return (
<div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
<div style={{ background: t.card, padding: 30, borderRadius: 16, border: `1px solid ${t.border}`, width: 300 }}>
<h2 style={{ textAlign: 'center', color: t.accent }}>LOGIN</h2>
<input placeholder="Usuario" value={u} onChange={e=>setU(e.target.value)} style={{ width: '100%', padding: 10, marginBottom: 10, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
<div style={{ position: 'relative', marginBottom: 20 }}>
<input type={show ? "text" : "password"} placeholder="Password" value={p} onChange={e=>setP(e.target.value)} style={{ width: '100%', padding: 10, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
<button onClick={()=>setShow(!show)} style={{ position: 'absolute', right: 5, top: 10, background: 'none', border: 'none' }}><EyeIcon visible={show} color={t.sub}/></button>
</div>
<button onClick={() => { const f = admins.find(a=>a.user===u && a.passHash===simpleHash(p)); if(f) onLogin(f); else alert("Error"); }} style={{ width: '100%', padding: 12, background: t.accent, color: '#000', border: 'none', fontWeight: 'bold', borderRadius: 4 }}>ENTRAR</button>
</div>
</div>
);
}
