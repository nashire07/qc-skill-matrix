import { useState, useMemo, useEffect, useCallback } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Legend,
} from "recharts";

// ══════════════════════════════════════════════════════
// SUPABASE CONFIG
// ══════════════════════════════════════════════════════
const SUPABASE_URL = "https://njblmbumywwcjwtybmmz.supabase.co";
const SUPABASE_KEY = "sb_publishable_lgAEKgxrbYhZVqvLEJTlbg_v2DDQCfU";

const sb = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed: ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const db = {
  login: async (email, password) => {
    const rows = await sb(`users?email=eq.${encodeURIComponent(email)}&select=*`);
    if (!rows.length) throw new Error("Email not found");
    if (rows[0].password !== password) throw new Error("Wrong password");
    return rows[0];
  },
  getMitras:      () => sb("mitras?select=*&order=name"),
  addMitra:       (d) => sb("mitras", { method: "POST", body: JSON.stringify({ name: d.name, employee_id: d.employeeId, join_date: d.joinDate || null }) }),
  updateMitra:    (id, d) => sb(`mitras?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ name: d.name, employee_id: d.employeeId, join_date: d.joinDate || null }) }),
  deleteMitra:    (id) => sb(`mitras?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  getCategories:  () => sb("categories?select=*&order=sort_order,name"),
  getSubs:        () => sb("sub_competencies?select=*&order=sort_order,name"),
  addCategory:    (name) => sb("categories", { method: "POST", body: JSON.stringify({ name }) }),
  updateCategory: (id, name) => sb(`categories?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteCategory: (id) => sb(`categories?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  addSub:         (catId, name, order) => sb("sub_competencies", { method: "POST", body: JSON.stringify({ category_id: catId, name, sort_order: order }) }),
  deleteSubs:     (catId) => sb(`sub_competencies?category_id=eq.${catId}`, { method: "DELETE", prefer: "return=minimal" }),
  getEvaluations: () => sb("evaluations?select=*&order=eval_date.desc"),
  addEval:        (d) => sb("evaluations", { method: "POST", body: JSON.stringify({ mitra_id: d.mitraId, officer_id: d.officerId, status: d.status, eval_date: d.date, notes: d.notes || "" }) }),
  updateEval:     (id, d) => sb(`evaluations?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: d.status, eval_date: d.date, notes: d.notes || "" }) }),
  updateStatus:   (id, status) => sb(`evaluations?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getScores:      () => sb("evaluation_scores?select=*"),
  addScores:      (evalId, scores) => sb("evaluation_scores", { method: "POST", body: JSON.stringify(Object.entries(scores).map(([subId, score]) => ({ evaluation_id: evalId, sub_competency_id: subId, score }))) }),
  deleteScores:   (evalId) => sb(`evaluation_scores?evaluation_id=eq.${evalId}`, { method: "DELETE", prefer: "return=minimal" }),
};

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
const today = new Date();
const avgScore = (scores) => { const v = Object.values(scores); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1) : 0; };
const getStatus = (d) => { if (!d) return "overdue"; const days=(today-new Date(d))/86400000; return days<=50?"on-time":days<=60?"due-soon":"overdue"; };
const nextDue   = (d) => { if (!d) return "—"; const x=new Date(d); x.setDate(x.getDate()+60); return x.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}); };
const fmtDate   = (d) => d ? new Date(d).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const dlCSV     = (rows,fn) => { const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=fn; a.click(); };

// ══════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Poppins:wght@600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#e8f4fd;--sur:#fff;--sur2:#d6ecfb;--bdr:#b8d9f0;--acc:#1565c0;--br:#2196f3;--yl:#ffc107;
    --red:#f44336;--grn:#00c853;--org:#ff9800;--mut:#5a7a99;--txt:#1a2b42;--r:14px;
    --fh:'Poppins',sans-serif;--fb:'Nunito',sans-serif;--sh:0 2px 12px rgba(21,101,192,.10)}
  body{background:var(--bg);color:var(--txt);font-family:var(--fb);font-size:14px}
  .app{display:flex;min-height:100vh}
  /* SIDEBAR */
  .sidebar{width:230px;min-height:100vh;background:linear-gradient(180deg,#1565c0,#0d47a1);display:flex;flex-direction:column;
    position:sticky;top:0;height:100vh;overflow-y:auto;flex-shrink:0;box-shadow:4px 0 20px rgba(21,101,192,.2);z-index:100}
  .sl{padding:24px 20px 20px;border-bottom:1px solid rgba(255,255,255,.12)}
  .sl-t{font-family:var(--fh);font-size:17px;font-weight:800;color:#fff}.sl-t span{color:var(--yl)}
  .sl-s{font-size:11px;color:rgba(255,255,255,.5);font-weight:600;margin-top:2px}
  .ns{padding:16px 14px 4px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.4);font-weight:700}
  .ni{display:flex;align-items:center;gap:10px;padding:11px 14px;margin:2px 10px;border-radius:10px;cursor:pointer;
    font-size:14px;color:rgba(255,255,255,.75);transition:all .18s;font-weight:600;border:none;background:none;width:calc(100% - 20px);text-align:left}
  .ni:hover{background:rgba(255,255,255,.12);color:#fff}
  .ni.active{background:#fff;color:#1565c0;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,.15)}
  /* TOPBAR */
  .topbar{display:none;align-items:center;gap:12px;padding:14px 16px;background:#fff;border-bottom:1.5px solid var(--bdr);position:sticky;top:0;z-index:99;box-shadow:var(--sh)}
  .hbg{background:none;border:none;font-size:22px;cursor:pointer;color:var(--acc);padding:4px 8px;border-radius:8px}
  .tb-t{font-family:var(--fh);font-size:15px;font-weight:800;color:var(--txt)}.tb-t span{color:var(--yl)}
  .mob-ov{display:none;position:fixed;inset:0;background:rgba(13,71,161,.45);z-index:98;backdrop-filter:blur(4px)}
  .mob-sb{position:fixed;left:0;top:0;bottom:0;width:240px;background:linear-gradient(180deg,#1565c0,#0d47a1);
    z-index:99;overflow-y:auto;box-shadow:4px 0 20px rgba(0,0,0,.3);transform:translateX(-100%);transition:transform .25s}
  .mob-sb.open{transform:translateX(0)}
  /* MAIN */
  .main{flex:1;overflow-y:auto;background:var(--bg)}
  .page{padding:28px;max-width:1200px}
  .ph{margin-bottom:24px}
  .pt{font-family:var(--fh);font-size:22px;font-weight:800;color:var(--txt)}
  .ps{font-size:13px;color:var(--mut);margin-top:3px;font-weight:600}
  /* CARD */
  .card{background:var(--sur);border:1.5px solid var(--bdr);border-radius:var(--r);padding:20px;box-shadow:var(--sh)}
  .ct{font-family:var(--fh);font-size:12px;font-weight:700;color:var(--mut);margin-bottom:14px;text-transform:uppercase;letter-spacing:.05em}
  /* STATS */
  .sr{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
  .sc{background:var(--sur);border:1.5px solid var(--bdr);border-radius:var(--r);padding:20px;box-shadow:var(--sh)}
  .sl2{font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
  .sv{font-family:var(--fh);font-size:32px;font-weight:800;margin-top:4px}
  .cbl{color:var(--br)}.cgr{color:var(--grn)}.cor{color:var(--org)}.crd{color:var(--red)}
  /* TABLE */
  .tw{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:left;padding:10px 14px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:700;border-bottom:2px solid var(--bdr);background:#f0f8ff}
  td{padding:12px 14px;border-bottom:1px solid var(--bdr);vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#f5fbff}
  /* BADGE */
  .badge{display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:99px;font-size:12px;font-weight:700}
  .badge.on-time,.badge.Approved{background:#e8f5e9;color:#2e7d32}
  .badge.due-soon{background:#fff8e1;color:#e65100}
  .badge.overdue{background:#ffebee;color:#c62828}
  .badge.Submitted{background:#e3f2fd;color:#1565c0}
  .badge.Draft{background:#f5f5f5;color:#757575}
  /* BTNS */
  .btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;border:none;transition:all .18s;font-family:var(--fb)}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn-p{background:linear-gradient(135deg,#1e88e5,#1565c0);color:#fff;box-shadow:0 3px 12px rgba(21,101,192,.28)}
  .btn-p:hover:not(:disabled){box-shadow:0 5px 18px rgba(21,101,192,.38);transform:translateY(-1px)}
  .btn-g{background:var(--sur);color:var(--acc);border:1.5px solid var(--bdr)}
  .btn-g:hover:not(:disabled){border-color:var(--br);background:#e3f2fd}
  .btn-d{background:#ffebee;color:var(--red);border:1.5px solid #ffcdd2}
  .btn-d:hover:not(:disabled){background:#ffcdd2}
  .btn-ok{background:linear-gradient(135deg,#00c853,#00897b);color:#fff}
  .sm{padding:6px 14px;font-size:13px}.xs{padding:4px 10px;font-size:12px;border-radius:7px}
  /* FORM */
  .fg{margin-bottom:14px}
  .fl{display:block;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin-bottom:6px}
  .fi,.fse,.fta{width:100%;background:#f5faff;border:1.5px solid var(--bdr);border-radius:10px;padding:10px 14px;
    color:var(--txt);font-size:14px;font-family:var(--fb);outline:none;transition:all .15s;font-weight:500}
  .fi:focus,.fse:focus,.fta:focus{border-color:var(--br);background:#fff;box-shadow:0 0 0 3px rgba(33,150,243,.1)}
  .fta{min-height:80px;resize:vertical}
  /* SCORES */
  .srow{display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--bdr)}
  .srow:last-child{border-bottom:none}
  .slbl{font-size:13.5px;color:var(--txt);font-weight:600}
  .sbts{display:flex;gap:7px}
  .sbt{width:36px;height:36px;border-radius:9px;border:1.5px solid var(--bdr);background:#f5faff;color:var(--mut);font-size:14px;font-weight:700;cursor:pointer;transition:all .14s;font-family:var(--fb)}
  .sbt.v1{--c:#f44336}.sbt.v2{--c:#ff9800}.sbt.v3{--c:#ffc107}.sbt.v4{--c:#8bc34a}.sbt.v5{--c:#00c853}
  .sbt.act{background:var(--c,#1565c0);color:#fff;border-color:var(--c,#1565c0);box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .sbt:hover:not(.act){border-color:var(--br);color:var(--br);background:#e3f2fd}
  /* MODAL */
  .mb{position:fixed;inset:0;background:rgba(13,71,161,.35);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;backdrop-filter:blur(6px)}
  .mo{background:var(--sur);border:1.5px solid var(--bdr);border-radius:18px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;padding:28px;position:relative;box-shadow:0 20px 60px rgba(21,101,192,.2)}
  .mol{max-width:840px}
  .mt2{font-family:var(--fh);font-size:19px;font-weight:800;margin-bottom:22px;color:var(--txt)}
  .mc{position:absolute;top:18px;right:18px;background:#f0f8ff;border:1.5px solid var(--bdr);border-radius:8px;width:32px;height:32px;cursor:pointer;color:var(--mut);font-size:16px;display:flex;align-items:center;justify-content:center;font-weight:700}
  .mc:hover{background:#ffebee;color:var(--red)}
  /* WIZARD */
  .ws{display:flex;align-items:center;margin-bottom:24px}
  .wst{display:flex;align-items:center;gap:8px;flex:1}
  .wc{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
  .wc.done{background:var(--grn);color:#fff}.wc.active{background:var(--br);color:#fff;box-shadow:0 0 0 3px rgba(33,150,243,.25)}.wc.pend{background:#e0e0e0;color:#9e9e9e}
  .wl{font-size:12px;font-weight:700;color:var(--mut)}.wl.active{color:var(--br)}
  .wln{flex:1;height:2px;background:var(--bdr);margin:0 8px}.wln.done{background:var(--grn)}
  /* MISC */
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .row{display:flex;align-items:center;gap:12px}.sp{flex:1}
  .gr{display:flex;gap:8px;flex-wrap:wrap}
  .m16{margin-top:16px}.m20{margin-top:20px}
  .es{text-align:center;padding:48px;color:var(--mut)}.ei{font-size:40px;margin-bottom:12px}
  .rw{height:300px;margin-top:8px}
  .al{padding:12px 16px;border-radius:11px;font-size:13.5px;margin-bottom:10px;display:flex;align-items:flex-start;gap:10px;font-weight:600}
  .aw{background:#fff8e1;border:1.5px solid #ffe082;color:#e65100}
  .ad{background:#ffebee;border:1.5px solid #ef9a9a;color:#c62828}
  .ai{background:#e3f2fd;border:1.5px solid #90caf9;color:#1565c0}
  .tabs{display:flex;gap:4px;border-bottom:2px solid var(--bdr);margin-bottom:20px}
  .tab{padding:9px 18px;font-size:14px;font-weight:700;cursor:pointer;border:none;background:none;color:var(--mut);border-bottom:3px solid transparent;margin-bottom:-2px;transition:all .15s;border-radius:8px 8px 0 0}
  .tab.active{color:var(--br);border-bottom-color:var(--br);background:#e3f2fd}
  .tab:hover:not(.active){color:var(--txt);background:#f0f8ff}
  .pb{height:7px;background:var(--sur2);border-radius:99px;overflow:hidden}
  .pf{height:100%;border-radius:99px;background:linear-gradient(90deg,#42a5f5,#1565c0);transition:width .5s}
  .av{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#42a5f5,#1565c0);display:inline-flex;align-items:center;justify-content:center;font-family:var(--fh);font-size:15px;font-weight:800;color:#fff;flex-shrink:0;box-shadow:0 2px 8px rgba(21,101,192,.25)}
  .hc{border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;transition:transform .15s}.hc:hover{transform:scale(1.12)}
  .lg-bg{min-height:100vh;background:linear-gradient(135deg,#1565c0,#0d47a1 50%,#1a237e);display:flex;align-items:center;justify-content:center;padding:20px}
  .lg-c{background:#fff;border-radius:20px;padding:40px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(13,71,161,.3)}
  .lg-l{font-family:var(--fh);font-size:24px;font-weight:800;color:var(--acc);margin-bottom:6px}.lg-l span{color:var(--yl)}
  .lg-s{font-size:13px;color:var(--mut);margin-bottom:28px;font-weight:500}
  .tl{display:flex;flex-direction:column}.ti{display:flex;gap:14px;padding-bottom:20px;position:relative}
  .ti:last-child{padding-bottom:0}.td{width:14px;height:14px;border-radius:50%;flex-shrink:0;margin-top:4px;position:relative;z-index:1}
  .tline{position:absolute;left:6px;top:18px;bottom:0;width:2px;background:var(--bdr)}.ti:last-child .tline{display:none}
  .tc{flex:1;background:#f5faff;border:1.5px solid var(--bdr);border-radius:10px;padding:12px 14px}
  .up{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,.12);border-radius:10px;margin:10px;cursor:pointer;border:none;width:calc(100% - 20px);text-align:left}
  .up:hover{background:rgba(255,255,255,.2)}.un{font-size:13px;font-weight:700;color:#fff}.ur{font-size:10px;color:rgba(255,255,255,.55);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
  .spin{display:inline-block;width:18px;height:18px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  .lscreen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;background:var(--bg)}
  .lscreen .spin{border-color:rgba(21,101,192,.2);border-top-color:var(--br);width:36px;height:36px;border-width:4px}
  @media(max-width:768px){.sidebar{display:none}.topbar{display:flex}.mob-ov.open{display:block}.sr{grid-template-columns:repeat(2,1fr)}.g2{grid-template-columns:1fr}.page{padding:16px}}
`;

// ══════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════
function Login({ onLogin }) {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!email || !pw) return setErr("Enter email and password");
    setBusy(true); setErr("");
    try { onLogin(await db.login(email.toLowerCase().trim(), pw)); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="lg-bg">
      <div className="lg-c">
        <div className="lg-l">QC <span>Matrix</span> ⭐</div>
        <div className="lg-s">Central Kitchen · Skill Tracker — Please sign in</div>
        {err && <div className="al ad" style={{marginBottom:14}}><span>⚠️</span>{err}</div>}
        <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" onKeyDown={e=>e.key==="Enter"&&go()} /></div>
        <div className="fg"><label className="fl">Password</label><input className="fi" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&go()} /></div>
        <button className="btn btn-p" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={go} disabled={busy}>{busy?<span className="spin"/>:"Sign In →"}</button>
        <div style={{marginTop:16,background:"#e3f2fd",borderRadius:10,padding:"12px 14px",fontSize:12,color:"#1565c0",fontWeight:600}}>
          <div style={{marginBottom:6,fontWeight:800}}>Demo Accounts:</div>
          <div>👑 Lead QC: lead@qc.com / lead123</div>
          <div>🔵 Officer: officer1@qc.com / officer123</div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// SIDEBAR CONTENT
// ══════════════════════════════════════════════════════
function Nav({ page, setPage, user, onLogout, onClose }) {
  const items = [
    {id:"dashboard",l:"Dashboard",i:"🏠"},{id:"mitras",l:"Mitra List",i:"👥"},
    {id:"evaluations",l:"Evaluations",i:"📋"},{id:"competencies",l:"Competencies",i:"📚"},
    {id:"analytics",l:"Analytics",i:"📊"},{id:"heatmap",l:"Skill Heatmap",i:"🗺️"},
  ];
  const go = id => { setPage(id); onClose?.(); };
  return (
    <>
      <div className="sl"><div className="sl-t">QC <span>Matrix</span> ⭐</div><div className="sl-s">Central Kitchen · Skill Tracker</div></div>
      <div style={{padding:"12px 0",flex:1}}>
        <div className="ns">Navigation</div>
        {items.map(n=><button key={n.id} className={`ni ${page===n.id?"active":""}`} onClick={()=>go(n.id)}><span>{n.i}</span>{n.l}</button>)}
      </div>
      <div style={{borderTop:"1px solid rgba(255,255,255,.12)",paddingBottom:12}}>
        <div className="ns">Signed In As</div>
        <button className="up" onClick={onLogout}>
          <div className="av" style={{width:30,height:30,fontSize:13}}>{user.name[0]}</div>
          <div><div className="un">{user.name}</div><div className="ur">{user.role==="lead"?"Junior Lead QC":"QC Officer"} · Logout</div></div>
        </button>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [mob, setMob] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [mitras, setMitras] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allSubs, setAllSubs] = useState([]);
  const [evals, setEvals] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const tip = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m,c,s,e,sc] = await Promise.all([db.getMitras(),db.getCategories(),db.getSubs(),db.getEvaluations(),db.getScores()]);
      setMitras(m);
      setCategories(c.map(cat=>({...cat,subs:s.filter(sub=>sub.category_id===cat.id)})));
      setAllSubs(s); setEvals(e); setScores(sc);
    } catch(e) { tip("Failed to load: "+e.message,"err"); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ if(user) load(); },[user]);

  const scMap = useMemo(()=>{
    const m={};
    scores.forEach(s=>{ if(!m[s.evaluation_id]) m[s.evaluation_id]={}; m[s.evaluation_id][s.sub_competency_id]=s.score; });
    return m;
  },[scores]);

  const richEvals = useMemo(()=>evals.map(e=>({...e,mitraId:e.mitra_id,date:e.eval_date,scores:scMap[e.id]||{}})),[evals,scMap]);

  const lastOk = useCallback((mid)=>richEvals.filter(e=>e.mitra_id===mid&&e.status==="Approved").sort((a,b)=>new Date(b.eval_date)-new Date(a.eval_date))[0]||null,[richEvals]);

  const mStats = useMemo(()=>mitras.map(m=>{
    const last=lastOk(m.id);
    return {...m,employeeId:m.employee_id,joinDate:m.join_date,lastEval:last,evalStatus:getStatus(last?.eval_date),nextDue:nextDue(last?.eval_date),avgScore:last?avgScore(last.scores):null};
  }),[mitras,lastOk]);

  const counts = useMemo(()=>({
    total:mitras.length,onTime:mStats.filter(m=>m.evalStatus==="on-time").length,
    dueSoon:mStats.filter(m=>m.evalStatus==="due-soon").length,overdue:mStats.filter(m=>m.evalStatus==="overdue").length,
    pending:richEvals.filter(e=>e.status==="Submitted").length,
  }),[mStats,richEvals]);

  // Actions
  const saveMitra = async d => {
    try { if(d.id) await db.updateMitra(d.id,d); else await db.addMitra(d); tip(d.id?"Mitra updated ✅":"Mitra added ✅"); await load(); setModal(null); }
    catch(e){ tip(e.message,"err"); }
  };
  const delMitra = async id => { try{ await db.deleteMitra(id); tip("Mitra deleted"); await load(); }catch(e){tip(e.message,"err");} };

  const saveEval = async d => {
    try {
      let eid=d.id;
      if(eid){ await db.updateEval(eid,{...d,date:d.date}); await db.deleteScores(eid); }
      else { const r=await db.addEval({...d,officerId:user.id}); eid=r[0].id; }
      await db.addScores(eid,d.scores);
      tip(d.status==="Submitted"?"Submitted for approval 📤":"Saved as draft 💾");
      await load(); setModal(null);
    } catch(e){ tip(e.message,"err"); }
  };

  const updStatus = async (id,status) => {
    try { await db.updateStatus(id,status); tip(status==="Approved"?"Approved ✅":"Status updated"); await load(); }
    catch(e){ tip(e.message,"err"); }
  };

  const saveCat = async cat => {
    try {
      let cid=cat.id;
      if(cid){ await db.updateCategory(cid,cat.name); await db.deleteSubs(cid); }
      else { const r=await db.addCategory(cat.name); cid=r[0].id; }
      for(let i=0;i<cat.subs.length;i++) await db.addSub(cid,cat.subs[i].name,i);
      tip("Category saved ✅"); await load(); setModal(null);
    } catch(e){ tip(e.message,"err"); }
  };
  const delCat = async id => { try{ await db.deleteCategory(id); tip("Deleted"); await load(); }catch(e){tip(e.message,"err");} };

  const expMitras = () => { const r=[["Name","ID","Last Eval","Score","Status","Next Due"]]; mStats.forEach(m=>r.push([m.name,m.employeeId||"—",m.lastEval?fmtDate(m.lastEval.eval_date):"Never",m.avgScore||"—",m.evalStatus,m.nextDue])); dlCSV(r,"qc_mitra.csv"); };
  const expEvals  = () => { const r=[["Mitra","Date","Score","Status","Notes"]]; richEvals.forEach(e=>{const m=mitras.find(x=>x.id===e.mitra_id); r.push([m?.name||"?",fmtDate(e.eval_date),avgScore(e.scores),e.status,e.notes||""]);}); dlCSV(r,"qc_evals.csv"); };

  if (!user) return <><style>{CSS}</style><Login onLogin={setUser}/></>;
  if (loading) return <><style>{CSS}</style><div className="lscreen"><div className="spin"/><div style={{color:"var(--mut)",fontWeight:600}}>Loading from database…</div></div></>;

  const p = {user,mitras,mStats,evals:richEvals,categories,allSubs,counts,setModal,setPage,delMitra,updStatus,delCat,expMitras,expEvals,saveMitra};

  return (
    <>
      <style>{CSS}</style>
      {toast&&<div style={{position:"fixed",top:20,right:20,zIndex:9999,padding:"12px 20px",borderRadius:12,fontWeight:700,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,.15)",background:toast.type==="err"?"#ffebee":"#e8f5e9",color:toast.type==="err"?"#c62828":"#2e7d32",border:"1.5px solid",borderColor:toast.type==="err"?"#ef9a9a":"#a5d6a7"}}>{toast.msg}</div>}
      <div className="app">
        <aside className="sidebar"><Nav page={page} setPage={setPage} user={user} onLogout={()=>setUser(null)}/></aside>
        <div className={`mob-ov ${mob?"open":""}`} onClick={()=>setMob(false)}/>
        <div className={`mob-sb ${mob?"open":""}`}><Nav page={page} setPage={setPage} user={user} onLogout={()=>setUser(null)} onClose={()=>setMob(false)}/></div>
        <main className="main">
          <div className="topbar">
            <button className="hbg" onClick={()=>setMob(true)}>☰</button>
            <span className="tb-t">QC <span>Matrix</span></span><div className="sp"/>
            <div className="av" style={{width:30,height:30,fontSize:13}}>{user.name[0]}</div>
          </div>
          {page==="dashboard"    && <Dash {...p}/>}
          {page==="mitras"       && <Mitras {...p}/>}
          {page==="evaluations"  && <Evals {...p}/>}
          {page==="competencies" && <Comps {...p} saveCat={saveCat}/>}
          {page==="analytics"    && <Analytics {...p}/>}
          {page==="heatmap"      && <Heatmap {...p}/>}
        </main>
      </div>
      {modal?.type==="mitra-form"   && <MitraForm   data={modal.data} onSave={saveMitra} onClose={()=>setModal(null)}/>}
      {modal?.type==="eval-wizard"  && <EvalWizard  data={modal.data} mitras={mitras} categories={categories} allSubs={allSubs} user={user} onSave={saveEval} onClose={()=>setModal(null)}/>}
      {modal?.type==="mitra-detail" && <MitraDetail mitra={modal.data} evals={richEvals.filter(e=>e.mitra_id===modal.data.id)} categories={categories} allSubs={allSubs} onClose={()=>setModal(null)} setModal={setModal}/>}
      {modal?.type==="cat-form"     && <CatForm     data={modal.data} onSave={saveCat} onClose={()=>setModal(null)}/>}
      {modal?.type==="eval-detail"  && <EvalDetail  ev={modal.data} mitras={mitras} categories={categories} onClose={()=>setModal(null)}/>}
    </>
  );
}

// ══════════════════════════════════════════════════════
// PAGES
// ══════════════════════════════════════════════════════
function Dash({mStats,counts,evals,mitras,user,setPage,setModal,expMitras}){
  const od=mStats.filter(m=>m.evalStatus==="overdue"), ds=mStats.filter(m=>m.evalStatus==="due-soon");
  return <div className="page">
    <div className="ph row"><div><div className="pt">👋 Welcome, {user.name.split(" ")[0]}!</div><div className="ps">Central Kitchen QC · Monitoring Dashboard</div></div><div className="sp"/>
      <button className="btn btn-g sm" onClick={expMitras}>⬇ Export CSV</button>
      {user.role==="officer"&&<button className="btn btn-p" onClick={()=>setModal({type:"eval-wizard",data:{}})}>+ New Evaluation</button>}
    </div>
    <div className="sr">
      <div className="sc"><div className="sl2">Total Mitra</div><div className="sv cbl">{counts.total}</div></div>
      <div className="sc"><div className="sl2">✅ On Time</div><div className="sv cgr">{counts.onTime}</div></div>
      <div className="sc"><div className="sl2">⏳ Due Soon</div><div className="sv cor">{counts.dueSoon}</div></div>
      <div className="sc"><div className="sl2">⚠️ Overdue</div><div className="sv crd">{counts.overdue}</div></div>
    </div>
    {od.length>0&&<div className="al ad"><span>⚠️</span><div><strong>{od.length} Mitra overdue:</strong> {od.map(m=>m.name).join(", ")}</div></div>}
    {ds.length>0&&<div className="al aw"><span>⏳</span><div><strong>{ds.length} due soon:</strong> {ds.map(m=>m.name).join(", ")}</div></div>}
    {user.role==="lead"&&counts.pending>0&&<div className="al ai"><span>📋</span><strong>{counts.pending} evaluation(s) pending approval</strong><button className="btn xs btn-g" style={{marginLeft:8}} onClick={()=>setPage("evaluations")}>Review →</button></div>}
    <div className="card"><div className="ct">📋 Mitra Evaluation Tracker</div>
      <div className="tw"><table><thead><tr><th>Mitra</th><th>ID</th><th>Last Eval</th><th>Next Due</th><th>Avg Score</th><th>Status</th><th></th></tr></thead>
        <tbody>{mStats.map(m=><tr key={m.id}>
          <td><div className="row"><div className="av">{m.name[0]}</div><span style={{fontWeight:600}}>{m.name}</span></div></td>
          <td style={{color:"var(--mut)",fontSize:12}}>{m.employeeId||"—"}</td>
          <td style={{fontSize:12}}>{m.lastEval?fmtDate(m.lastEval.eval_date):<span style={{color:"var(--red)"}}>Never</span>}</td>
          <td style={{fontSize:12}}>{m.nextDue}</td>
          <td>{m.avgScore?<div className="row"><div className="pb" style={{width:60}}><div className="pf" style={{width:`${(m.avgScore/5)*100}%`}}/></div><span style={{fontSize:12,fontWeight:700}}>{m.avgScore}</span></div>:<span style={{color:"var(--mut)"}}>—</span>}</td>
          <td><span className={`badge ${m.evalStatus}`}>{m.evalStatus==="on-time"?"✅ On Time":m.evalStatus==="due-soon"?"⏳ Due Soon":"⚠️ Overdue"}</span></td>
          <td><button className="btn btn-g xs" onClick={()=>setModal({type:"mitra-detail",data:m})}>View</button></td>
        </tr>)}</tbody>
      </table></div>
    </div>
    <div className="card m20"><div className="ct">🕒 Recent Evaluations</div>
      <div className="tw"><table><thead><tr><th>Mitra</th><th>Date</th><th>Score</th><th>Status</th><th></th></tr></thead>
        <tbody>{evals.slice(0,6).map(e=>{const m=mitras.find(x=>x.id===e.mitra_id); return <tr key={e.id}>
          <td style={{fontWeight:600}}>{m?.name||"—"}</td>
          <td style={{fontSize:12}}>{fmtDate(e.eval_date)}</td>
          <td style={{fontWeight:700}}>{avgScore(e.scores)}/5</td>
          <td><span className={`badge ${e.status}`}>{e.status}</span></td>
          <td><button className="btn btn-g xs" onClick={()=>setModal({type:"eval-detail",data:e})}>Details</button></td>
        </tr>;})}</tbody>
      </table></div>
    </div>
  </div>;
}

function Mitras({mStats,user,setModal,delMitra,expMitras}){
  const [s,setS]=useState(""); const [f,setF]=useState("all");
  const list=mStats.filter(m=>m.name.toLowerCase().includes(s.toLowerCase())&&(f==="all"||m.evalStatus===f));
  return <div className="page">
    <div className="ph row"><div><div className="pt">👥 Mitra Management</div><div className="ps">QC field staff list</div></div><div className="sp"/>
      <button className="btn btn-g sm" onClick={expMitras}>⬇ Export</button>
      <button className="btn btn-p" onClick={()=>setModal({type:"mitra-form",data:null})}>+ Add Mitra</button>
    </div>
    <div className="row" style={{marginBottom:16,flexWrap:"wrap"}}>
      <input className="fi" style={{maxWidth:240}} placeholder="Search name…" value={s} onChange={e=>setS(e.target.value)}/>
      {["all","on-time","due-soon","overdue"].map(x=><button key={x} className={`btn sm ${f===x?"btn-p":"btn-g"}`} onClick={()=>setF(x)}>{x==="all"?"All":x==="on-time"?"✅ On Time":x==="due-soon"?"⏳ Due Soon":"⚠️ Overdue"}</button>)}
    </div>
    <div className="card"><div className="tw"><table><thead><tr><th>Mitra</th><th>ID</th><th>Join Date</th><th>Last Eval</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        {list.length===0&&<tr><td colSpan={7}><div className="es"><div className="ei">👥</div>No Mitra found</div></td></tr>}
        {list.map(m=><tr key={m.id}>
          <td><div className="row"><div className="av">{m.name[0]}</div><span style={{fontWeight:600}}>{m.name}</span></div></td>
          <td style={{color:"var(--mut)",fontSize:12}}>{m.employeeId||"—"}</td>
          <td style={{fontSize:12,color:"var(--mut)"}}>{m.joinDate||"—"}</td>
          <td style={{fontSize:12}}>{m.lastEval?fmtDate(m.lastEval.eval_date):<span style={{color:"var(--red)"}}>Never</span>}</td>
          <td style={{fontWeight:700}}>{m.avgScore||<span style={{color:"var(--mut)"}}>—</span>}</td>
          <td><span className={`badge ${m.evalStatus}`}>{m.evalStatus==="on-time"?"✅ On Time":m.evalStatus==="due-soon"?"⏳ Due Soon":"⚠️ Overdue"}</span></td>
          <td><div className="gr">
            <button className="btn btn-g xs" onClick={()=>setModal({type:"mitra-detail",data:m})}>View</button>
            <button className="btn btn-g xs" onClick={()=>setModal({type:"eval-wizard",data:{mitraId:m.id}})}>Evaluate</button>
            <button className="btn btn-g xs" onClick={()=>setModal({type:"mitra-form",data:m})}>Edit</button>
            <button className="btn btn-d xs" onClick={()=>delMitra(m.id)}>Del</button>
          </div></td>
        </tr>)}
      </tbody>
    </table></div></div>
  </div>;
}

function Evals({evals,mitras,user,setModal,updStatus,expEvals}){
  const [tab,setTab]=useState("all");
  const list=[...evals].filter(e=>tab==="all"||e.status===tab).sort((a,b)=>new Date(b.eval_date)-new Date(a.eval_date));
  return <div className="page">
    <div className="ph row"><div><div className="pt">📋 Evaluations</div><div className="ps">All competency assessments</div></div><div className="sp"/>
      <button className="btn btn-g sm" onClick={expEvals}>⬇ Export</button>
      <button className="btn btn-p" onClick={()=>setModal({type:"eval-wizard",data:{}})}>+ New Evaluation</button>
    </div>
    <div className="tabs">{["all","Draft","Submitted","Approved"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>
      {t==="all"?"All":t}<span style={{marginLeft:6,fontSize:10,background:"var(--sur2)",borderRadius:99,padding:"1px 7px"}}>{t==="all"?evals.length:evals.filter(e=>e.status===t).length}</span>
    </button>)}</div>
    <div className="card"><div className="tw"><table><thead><tr><th>Mitra</th><th>Date</th><th>Score</th><th>Notes</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        {list.length===0&&<tr><td colSpan={6}><div className="es"><div className="ei">📋</div>No evaluations</div></td></tr>}
        {list.map(e=>{const m=mitras.find(x=>x.id===e.mitra_id); return <tr key={e.id}>
          <td><div className="row"><div className="av">{m?.name?.[0]||"?"}</div><span style={{fontWeight:600}}>{m?.name||"Unknown"}</span></div></td>
          <td style={{fontSize:12}}>{fmtDate(e.eval_date)}</td>
          <td style={{fontWeight:700}}>{avgScore(e.scores)}/5</td>
          <td style={{fontSize:12,color:"var(--mut)",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.notes||"—"}</td>
          <td><span className={`badge ${e.status}`}>{e.status}</span></td>
          <td><div className="gr">
            <button className="btn btn-g xs" onClick={()=>setModal({type:"eval-detail",data:e})}>Details</button>
            {user.role==="lead"&&e.status==="Submitted"&&<button className="btn btn-ok xs" onClick={()=>updStatus(e.id,"Approved")}>✅ Approve</button>}
            {e.status!=="Approved"&&<button className="btn btn-g xs" onClick={()=>setModal({type:"eval-wizard",data:e})}>Edit</button>}
          </div></td>
        </tr>;})}
      </tbody>
    </table></div></div>
  </div>;
}

function Comps({categories,user,setModal,delCat}){
  return <div className="page">
    <div className="ph row"><div><div className="pt">📚 Competency Framework</div><div className="ps">Categories and sub-competencies</div></div><div className="sp"/>
      {user.role==="lead"&&<button className="btn btn-p" onClick={()=>setModal({type:"cat-form",data:null})}>+ Add Category</button>}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {categories.map(cat=><div key={cat.id} className="card">
        <div className="row" style={{marginBottom:14}}>
          <div style={{fontFamily:"var(--fh)",fontWeight:800,fontSize:16}}>{cat.name}</div>
          <div style={{background:"var(--sur2)",borderRadius:99,padding:"2px 10px",fontSize:11,fontWeight:700,color:"var(--mut)"}}>{cat.subs.length} competencies</div>
          <div className="sp"/>
          {user.role==="lead"&&<div className="gr"><button className="btn btn-g xs" onClick={()=>setModal({type:"cat-form",data:cat})}>✏️ Edit</button><button className="btn btn-d xs" onClick={()=>delCat(cat.id)}>Delete</button></div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
          {cat.subs.map(sub=><div key={sub.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"var(--bg)",borderRadius:9,fontSize:13,fontWeight:600,border:"1.5px solid var(--bdr)"}}>
            <span style={{color:"var(--br)",fontSize:10}}>▸</span>{sub.name}
          </div>)}
        </div>
      </div>)}
    </div>
  </div>;
}

function Analytics({mitras,evals,categories,allSubs}){
  const [sel,setSel]=useState(mitras[0]?.id||"");
  const me=evals.filter(e=>e.mitra_id===sel&&e.status==="Approved").sort((a,b)=>new Date(a.eval_date)-new Date(b.eval_date));
  const latest=me[me.length-1], prev=me[me.length-2];
  const rd=categories.map(cat=>({subject:cat.name.replace(" Process",""),current:latest?Number((cat.subs.reduce((s,sub)=>s+(latest.scores[sub.id]||0),0)/cat.subs.length).toFixed(1)):0,previous:prev?Number((cat.subs.reduce((s,sub)=>s+(prev.scores[sub.id]||0),0)/cat.subs.length).toFixed(1)):0,fullMark:5}));
  const ss=allSubs.map(sub=>({name:sub.name,current:latest?(latest.scores[sub.id]||0):0,previous:prev?(prev.scores[sub.id]||0):0})).sort((a,b)=>a.current-b.current);
  const wk=ss.filter(s=>s.current<4).slice(0,3);
  const td=me.map(e=>({date:fmtDate(e.eval_date),avg:Number(avgScore(e.scores))}));
  const mitra=mitras.find(m=>m.id===sel);
  return <div className="page">
    <div className="ph"><div className="pt">📊 Analytics & Insights</div><div className="ps">Competency visualization per Mitra</div></div>
    <div className="fg" style={{maxWidth:280,marginBottom:20}}><label className="fl">Select Mitra</label>
      <select className="fse" value={sel} onChange={e=>setSel(e.target.value)}>{mitras.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
    </div>
    {!latest?<div className="es card"><div className="ei">📊</div>No approved evaluations yet.</div>:<>
      <div className="g2" style={{gap:16,marginBottom:16}}>
        <div className="card"><div className="ct">🕸️ Radar — {mitra?.name}</div>
          <div className="rw"><ResponsiveContainer width="100%" height="100%"><RadarChart data={rd}>
            <PolarGrid stroke="#b8d9f0"/><PolarAngleAxis dataKey="subject" tick={{fill:"var(--mut)",fontSize:11}}/>
            <PolarRadiusAxis angle={90} domain={[0,5]} tick={{fill:"var(--mut)",fontSize:10}} tickCount={6}/>
            <Radar name="Current" dataKey="current" stroke="#2196f3" fill="#2196f3" fillOpacity={0.18} strokeWidth={2.5}/>
            {prev&&<Radar name="Previous" dataKey="previous" stroke="#ff9800" fill="#ff9800" fillOpacity={0.10} strokeWidth={1.5} strokeDasharray="5 3"/>}
            <Tooltip contentStyle={{background:"#fff",border:"1.5px solid var(--bdr)",borderRadius:10,fontSize:12}}/><Legend/>
          </RadarChart></ResponsiveContainer></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="card"><div className="ct">📈 Scores</div>
            {ss.map(s=><div key={s.name} style={{marginBottom:10}}>
              <div className="row" style={{marginBottom:4}}><span style={{fontSize:12,fontWeight:600}}>{s.name}</span><div className="sp"/>
                <span style={{fontSize:11,fontWeight:800,color:s.current>=4?"var(--grn)":s.current>=3?"var(--org)":"var(--red)"}}>{s.current}/5</span>
                {prev&&<span style={{fontSize:10,color:"var(--mut)"}}>{s.current>s.previous?"↑":s.current<s.previous?"↓":"→"}</span>}
              </div>
              <div className="pb"><div className="pf" style={{width:`${(s.current/5)*100}%`,background:s.current>=4?"var(--grn)":s.current>=3?"var(--org)":"var(--red)"}}/></div>
            </div>)}
          </div>
          {wk.length>0&&<div className="card" style={{border:"1.5px solid #ffcdd2",background:"#fff9f9"}}>
            <div className="ct" style={{color:"var(--red)"}}>🎯 Training Needed</div>
            <div style={{fontSize:13,lineHeight:1.7}}><strong>{mitra?.name}</strong> needs improvement in:
              <ul style={{marginTop:8,paddingLeft:16}}>{wk.map(w=><li key={w.name} style={{color:"var(--org)",fontWeight:600}}>{w.name} <span style={{color:"var(--mut)",fontWeight:400}}>({w.current}/5)</span></li>)}</ul>
            </div>
          </div>}
        </div>
      </div>
      {td.length>=2&&<div className="card"><div className="ct">📉 Score Trend</div>
        <div style={{height:200}}><ResponsiveContainer width="100%" height="100%"><LineChart data={td}>
          <CartesianGrid stroke="#e3f2fd" strokeDasharray="4 4"/>
          <XAxis dataKey="date" tick={{fill:"var(--mut)",fontSize:11}}/><YAxis domain={[0,5]} tick={{fill:"var(--mut)",fontSize:11}}/>
          <Tooltip contentStyle={{background:"#fff",border:"1.5px solid var(--bdr)",borderRadius:10,fontSize:12}}/>
          <Line type="monotone" dataKey="avg" stroke="#2196f3" strokeWidth={2.5} dot={{fill:"#2196f3",r:5}} name="Avg Score"/>
        </LineChart></ResponsiveContainer></div>
      </div>}
    </>}
  </div>;
}

function Heatmap({mitras,evals,allSubs,categories}){
  const hc=s=>!s?"#e0e0e0":s>=4.5?"#00c853":s>=3.5?"#64dd17":s>=2.5?"#ffc107":s>=1.5?"#ff9800":"#f44336";
  const lo=mid=>evals.filter(e=>e.mitra_id===mid&&e.status==="Approved").sort((a,b)=>new Date(b.eval_date)-new Date(a.eval_date))[0]||null;
  const data=mitras.map(m=>({mitra:m,scores:allSubs.reduce((acc,sub)=>{const l=lo(m.id);acc[sub.id]=l?(l.scores[sub.id]||0):null;return acc},{})}));
  return <div className="page">
    <div className="ph"><div className="pt">🗺️ Team Skill Heatmap</div><div className="ps">Competency gaps across all Mitra</div></div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{fontSize:12,fontWeight:700,color:"var(--mut)"}}>Score:</span>
      {[["#f44336","1"],["#ff9800","2"],["#ffc107","3"],["#64dd17","4"],["#00c853","5"],["#e0e0e0","No data"]].map(([c,l])=><div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600}}><div style={{width:16,height:16,borderRadius:4,background:c}}/>{l}</div>)}
    </div>
    <div className="card" style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"separate",borderSpacing:4}}>
        <thead>
          <tr><th style={{textAlign:"left",padding:"6px 10px",fontSize:11,color:"var(--mut)",fontWeight:700,minWidth:130}}>Mitra</th>
            {categories.map(cat=><th key={cat.id} colSpan={cat.subs.length} style={{textAlign:"center",padding:"4px 6px",fontSize:10,color:"var(--acc)",fontWeight:800,textTransform:"uppercase",background:"#e3f2fd",borderRadius:6}}>{cat.name.replace(" Process","")}</th>)}
          </tr>
          <tr><th/>{allSubs.map(sub=><th key={sub.id} style={{fontSize:9,fontWeight:700,color:"var(--mut)",padding:"4px 6px",textAlign:"center",maxWidth:80}}>{sub.name.length>12?sub.name.slice(0,11)+"…":sub.name}</th>)}</tr>
        </thead>
        <tbody>{data.map(row=><tr key={row.mitra.id}>
          <td style={{fontWeight:700,fontSize:13,padding:"6px 10px",whiteSpace:"nowrap"}}>
            <div className="row"><div className="av" style={{width:28,height:28,fontSize:12}}>{row.mitra.name[0]}</div>{row.mitra.name}</div>
          </td>
          {allSubs.map(sub=>{const s=row.scores[sub.id]; return <td key={sub.id} style={{padding:3,textAlign:"center"}}><div className="hc" style={{background:hc(s),width:44,height:34,margin:"0 auto",color:"#fff",fontSize:13,fontWeight:800,borderRadius:7}}>{s||"—"}</div></td>;})}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════
// EVAL WIZARD
// ══════════════════════════════════════════════════════
function EvalWizard({data,mitras,categories,allSubs,user,onSave,onClose}){
  const es={}; allSubs.forEach(s=>es[s.id]=3);
  const [step,setStep]=useState(1); const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({mitraId:data?.mitraId||data?.mitra_id||"",date:data?.eval_date||new Date().toISOString().split("T")[0],status:"Draft",notes:data?.notes||"",id:data?.id||null,scores:{...es,...(data?.scores||{})}});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const setScore=(sid,v)=>setForm(f=>({...f,scores:{...f.scores,[sid]:v}}));
  const sm=mitras.find(m=>m.id===form.mitraId);
  const steps=["Select Mitra","Score Competencies","Review & Submit"];
  const doSave=async st=>{ setBusy(true); try{await onSave({...form,status:st});}finally{setBusy(false);} };
  return <div className="mb"><div className="mo mol">
    <button className="mc" onClick={onClose}>✕</button>
    <div className="mt2">{data?.id?"Edit Evaluation":"New Evaluation"}</div>
    <div className="ws" style={{marginBottom:24}}>
      {steps.map((label,i)=>{const n=i+1,done=step>n,active=step===n; return <div key={n} className="wst">
        <div className={`wc ${done?"done":active?"active":"pend"}`}>{done?"✓":n}</div>
        <span className={`wl ${active?"active":""}`}>{label}</span>
        {i<steps.length-1&&<div className={`wln ${done?"done":""}`}/>}
      </div>;})}
    </div>
    {step===1&&<div>
      <div className="fg"><label className="fl">Select Mitra *</label>
        <select className="fse" value={form.mitraId} onChange={e=>set("mitraId",e.target.value)}>
          <option value="">Choose a Mitra…</option>
          {mitras.map(m=><option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>)}
        </select>
      </div>
      {sm&&<div style={{background:"#e3f2fd",borderRadius:12,padding:16,border:"1.5px solid #90caf9",marginTop:8}}>
        <div className="row"><div className="av" style={{width:44,height:44,fontSize:18}}>{sm.name[0]}</div>
          <div><div style={{fontWeight:800,fontSize:15}}>{sm.name}</div><div style={{fontSize:12,color:"var(--mut)",marginTop:2}}>{sm.employee_id} · Joined {sm.join_date}</div></div>
        </div>
      </div>}
      <div className="fg m16"><label className="fl">Evaluation Date</label><input className="fi" type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></div>
      <div className="row m20"><div className="sp"/><button className="btn btn-p" onClick={()=>form.mitraId&&setStep(2)} disabled={!form.mitraId}>Next: Score Competencies →</button></div>
    </div>}
    {step===2&&<div>
      <div className="al ai"><span>💡</span>Score 1 (very poor) to 5 (excellent). Tap a number to select.</div>
      {categories.map(cat=><div key={cat.id} style={{marginBottom:20}}>
        <div style={{fontFamily:"var(--fh)",fontWeight:800,fontSize:14,color:"var(--acc)",marginBottom:10,padding:"8px 12px",background:"var(--sur2)",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
          📁 {cat.name}<span style={{marginLeft:"auto",fontSize:11,fontWeight:600,color:"var(--mut)"}}>avg: {(cat.subs.reduce((s,sub)=>s+(form.scores[sub.id]||0),0)/cat.subs.length).toFixed(1)}/5</span>
        </div>
        {cat.subs.map(sub=><div key={sub.id} className="srow">
          <span className="slbl">{sub.name}</span>
          <div className="sbts">{[1,2,3,4,5].map(v=><button key={v} className={`sbt v${v} ${form.scores[sub.id]===v?"act":""}`} onClick={()=>setScore(sub.id,v)}>{v}</button>)}</div>
        </div>)}
      </div>)}
      <div className="row m16"><button className="btn btn-g" onClick={()=>setStep(1)}>← Back</button><div className="sp"/>
        <span style={{fontSize:13,fontWeight:700,color:"var(--mut)"}}>Overall: <span style={{color:"var(--br)",fontSize:16}}>{avgScore(form.scores)}</span>/5</span>
        <button className="btn btn-p" onClick={()=>setStep(3)}>Next: Review →</button>
      </div>
    </div>}
    {step===3&&<div>
      <div style={{background:"#f5faff",border:"1.5px solid var(--bdr)",borderRadius:12,padding:16,marginBottom:16}}>
        <div className="row" style={{marginBottom:12}}>
          <div className="av" style={{width:44,height:44,fontSize:18}}>{sm?.name[0]}</div>
          <div><div style={{fontWeight:800,fontSize:15}}>{sm?.name}</div><div style={{fontSize:12,color:"var(--mut)"}}>{fmtDate(form.date)}</div></div>
          <div className="sp"/><div style={{textAlign:"right"}}><div style={{fontSize:11,color:"var(--mut)",fontWeight:700}}>Overall Score</div><div style={{fontSize:28,fontWeight:800,color:"var(--br)"}}>{avgScore(form.scores)}<span style={{fontSize:14,color:"var(--mut)"}}>/ 5</span></div></div>
        </div>
        {categories.map(cat=><div key={cat.id} style={{marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:800,color:"var(--acc)",marginBottom:6}}>{cat.name}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:6}}>
            {cat.subs.map(sub=>{const s=form.scores[sub.id]||0; return <div key={sub.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff",border:"1.5px solid var(--bdr)",borderRadius:8,padding:"6px 10px"}}>
              <span style={{fontSize:12,fontWeight:600}}>{sub.name}</span>
              <span style={{fontWeight:800,fontSize:14,color:s>=4?"var(--grn)":s>=3?"var(--org)":"var(--red)"}}>{s}</span>
            </div>;})}
          </div>
        </div>)}
      </div>
      <div className="fg"><label className="fl">Notes</label><textarea className="fta" value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Add notes or observations…"/></div>
      <div className="row m16">
        <button className="btn btn-g" onClick={()=>setStep(2)}>← Back</button><div className="sp"/>
        <button className="btn btn-g" onClick={()=>doSave("Draft")} disabled={busy}>💾 Save Draft</button>
        <button className="btn btn-p" onClick={()=>doSave("Submitted")} disabled={busy}>{busy?<span className="spin"/>:"📤 Submit for Approval"}</button>
      </div>
    </div>}
  </div></div>;
}

// ══════════════════════════════════════════════════════
// OTHER MODALS
// ══════════════════════════════════════════════════════
function MitraDetail({mitra,evals,categories,allSubs,onClose,setModal}){
  const [tab,setTab]=useState("overview");
  const ok=evals.filter(e=>e.status==="Approved").sort((a,b)=>new Date(b.eval_date)-new Date(a.eval_date));
  const latest=ok[0];
  const es=latest?((today-new Date(latest.eval_date))/86400000<=50?"on-time":(today-new Date(latest.eval_date))/86400000<=60?"due-soon":"overdue"):"overdue";
  const rd=categories.map(cat=>({subject:cat.name.replace(" Process",""),score:latest?Number((cat.subs.reduce((s,sub)=>s+(latest.scores[sub.id]||0),0)/cat.subs.length).toFixed(1)):0,fullMark:5}));
  return <div className="mb"><div className="mo mol">
    <button className="mc" onClick={onClose}>✕</button>
    <div className="row" style={{marginBottom:20}}>
      <div className="av" style={{width:50,height:50,fontSize:20}}>{mitra.name[0]}</div>
      <div><div style={{fontFamily:"var(--fh)",fontWeight:800,fontSize:18}}>{mitra.name}</div><div style={{fontSize:12,color:"var(--mut)",marginTop:2}}>{mitra.employee_id||mitra.employeeId} · Joined {mitra.join_date||mitra.joinDate}</div></div>
      <div className="sp"/><span className={`badge ${es}`}>{es==="on-time"?"✅ On Time":es==="due-soon"?"⏳ Due Soon":"⚠️ Overdue"}</span>
      <button className="btn btn-p sm" onClick={()=>{onClose();setModal({type:"eval-wizard",data:{mitraId:mitra.id}});}}>+ Evaluate</button>
    </div>
    <div className="tabs">{["overview","timeline"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t==="overview"?"📊 Overview":"🕒 History"}</button>)}</div>
    {tab==="overview"&&(!latest?<div className="es"><div className="ei">📊</div>No approved evaluations yet.</div>:
      <div className="g2">
        <div><div style={{fontSize:12,fontWeight:700,color:"var(--mut)",textTransform:"uppercase",marginBottom:10}}>Competency Radar</div>
          <div className="rw" style={{height:260}}><ResponsiveContainer width="100%" height="100%"><RadarChart data={rd}>
            <PolarGrid stroke="#b8d9f0"/><PolarAngleAxis dataKey="subject" tick={{fill:"var(--mut)",fontSize:10}}/>
            <PolarRadiusAxis angle={90} domain={[0,5]} tick={{fill:"var(--mut)",fontSize:9}} tickCount={6}/>
            <Radar dataKey="score" stroke="#2196f3" fill="#2196f3" fillOpacity={0.2} strokeWidth={2.5}/>
            <Tooltip contentStyle={{background:"#fff",border:"1.5px solid var(--bdr)",borderRadius:10,fontSize:12}}/>
          </RadarChart></ResponsiveContainer></div>
        </div>
        <div><div style={{fontSize:12,fontWeight:700,color:"var(--mut)",textTransform:"uppercase",marginBottom:10}}>Latest Scores</div>
          {allSubs.map(sub=>{const s=latest.scores[sub.id]||0; return <div key={sub.id} style={{marginBottom:8}}>
            <div className="row" style={{marginBottom:3}}><span style={{fontSize:12,fontWeight:600}}>{sub.name}</span><div className="sp"/><span style={{fontWeight:800,fontSize:12,color:s>=4?"var(--grn)":s>=3?"var(--org)":"var(--red)"}}>{s}/5</span></div>
            <div className="pb"><div className="pf" style={{width:`${(s/5)*100}%`,background:s>=4?"var(--grn)":s>=3?"var(--org)":"var(--red)"}}/></div>
          </div>;})}
        </div>
      </div>
    )}
    {tab==="timeline"&&(evals.length===0?<div className="es"><div className="ei">🕒</div>No evaluations yet.</div>:
      <div className="tl">{[...evals].sort((a,b)=>new Date(b.eval_date)-new Date(a.eval_date)).map(e=><div key={e.id} className="ti">
        <div><div className="td" style={{background:e.status==="Approved"?"var(--grn)":e.status==="Submitted"?"var(--br)":"var(--mut)"}}/><div className="tline"/></div>
        <div className="tc">
          <div className="row" style={{marginBottom:4}}><span style={{fontWeight:700,fontSize:13}}>{fmtDate(e.eval_date)}</span><span className={`badge ${e.status}`} style={{fontSize:11}}>{e.status}</span><div className="sp"/><span style={{fontWeight:800,color:"var(--br)"}}>{avgScore(e.scores)}/5</span></div>
          {e.notes&&<div style={{fontSize:12,color:"var(--mut)"}}>{e.notes}</div>}
        </div>
      </div>)}
    </div>)}
  </div></div>;
}

function EvalDetail({ev:e,mitras,categories,onClose}){
  const m=mitras.find(x=>x.id===e.mitra_id);
  return <div className="mb"><div className="mo mol">
    <button className="mc" onClick={onClose}>✕</button>
    <div className="mt2">Evaluation Details</div>
    <div style={{background:"var(--sur2)",borderRadius:12,padding:14,marginBottom:18}}>
      <div className="row">
        <div className="av" style={{width:44,height:44,fontSize:18}}>{m?.name?.[0]||"?"}</div>
        <div><div style={{fontWeight:800,fontSize:15}}>{m?.name||"Unknown"}</div><div style={{fontSize:12,color:"var(--mut)"}}>{fmtDate(e.eval_date)}</div></div>
        <div className="sp"/><div style={{textAlign:"right"}}><span className={`badge ${e.status}`}>{e.status}</span><div style={{fontSize:22,fontWeight:800,color:"var(--br)",marginTop:4}}>{avgScore(e.scores)}/5</div></div>
      </div>
    </div>
    {categories.map(cat=><div key={cat.id} style={{marginBottom:16}}>
      <div style={{fontFamily:"var(--fh)",fontWeight:800,fontSize:13,color:"var(--acc)",marginBottom:8,textTransform:"uppercase"}}>{cat.name}</div>
      {cat.subs.map(sub=>{const s=e.scores[sub.id]||0; return <div key={sub.id} className="srow">
        <span className="slbl">{sub.name}</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>{[1,2,3,4,5].map(v=><div key={v} style={{width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:v===s?(v>=4?"var(--grn)":v>=3?"var(--org)":"var(--red)"):"var(--sur2)",color:v===s?"#fff":"var(--mut)",fontWeight:800,fontSize:13,border:`1.5px solid ${v===s?"transparent":"var(--bdr)"}`}}>{v}</div>)}</div>
      </div>;})}
    </div>)}
    {e.notes&&<div style={{background:"#f5faff",border:"1.5px solid var(--bdr)",borderRadius:10,padding:14,fontSize:13,color:"var(--mut)"}}>📝 {e.notes}</div>}
  </div></div>;
}

function MitraForm({data,onSave,onClose}){
  const [form,setForm]=useState({name:data?.name||"",employeeId:data?.employee_id||data?.employeeId||"",joinDate:data?.join_date||data?.joinDate||"",id:data?.id||null});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  return <div className="mb"><div className="mo">
    <button className="mc" onClick={onClose}>✕</button>
    <div className="mt2">{data?"Edit Mitra":"Add New Mitra"}</div>
    <div className="fg"><label className="fl">Full Name *</label><input className="fi" value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Andi Pratama"/></div>
    <div className="g2">
      <div className="fg"><label className="fl">Employee ID</label><input className="fi" value={form.employeeId} onChange={e=>set("employeeId",e.target.value)} placeholder="QCM-00X"/></div>
      <div className="fg"><label className="fl">Join Date</label><input className="fi" type="date" value={form.joinDate} onChange={e=>set("joinDate",e.target.value)}/></div>
    </div>
    <div className="row m16"><button className="btn btn-g" onClick={onClose}>Cancel</button><div className="sp"/><button className="btn btn-p" onClick={()=>form.name&&onSave(form)}>{data?"Save Changes":"Add Mitra"}</button></div>
  </div></div>;
}

function CatForm({data,onSave,onClose}){
  const [name,setName]=useState(data?.name||""); const [subs,setSubs]=useState(data?.subs||[]); const [ns,setNs]=useState("");
  const uid=()=>Math.random().toString(36).slice(2,10);
  const add=()=>{ if(ns.trim()){setSubs(p=>[...p,{id:uid(),name:ns.trim()}]);setNs("");} };
  return <div className="mb"><div className="mo">
    <button className="mc" onClick={onClose}>✕</button>
    <div className="mt2">{data?"Edit Category":"New Category"}</div>
    <div className="fg"><label className="fl">Category Name</label><input className="fi" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Inbound Process"/></div>
    <div className="fg"><label className="fl">Sub-Competencies</label>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
        {subs.map((s,i)=><div key={s.id||i} className="row"><span style={{flex:1,fontSize:13,fontWeight:600,padding:"8px 12px",background:"var(--bg)",borderRadius:8,border:"1.5px solid var(--bdr)"}}>{s.name}</span><button className="btn btn-d xs" onClick={()=>setSubs(p=>p.filter((_,idx)=>idx!==i))}>✕</button></div>)}
      </div>
      <div className="row"><input className="fi" value={ns} onChange={e=>setNs(e.target.value)} placeholder="Add sub-competency…" onKeyDown={e=>e.key==="Enter"&&add()}/><button className="btn btn-g" onClick={add}>Add</button></div>
    </div>
    <div className="row m16"><button className="btn btn-g" onClick={onClose}>Cancel</button><div className="sp"/><button className="btn btn-p" onClick={()=>name&&onSave({id:data?.id,name,subs})}>Save</button></div>
  </div></div>;
}
