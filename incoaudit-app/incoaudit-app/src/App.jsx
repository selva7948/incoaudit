import React, { useMemo, useState } from "react";
import {
  LayoutDashboard, BookOpen, TrendingUp, Bell, Target, Settings,
  Plus, ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle2,
  PiggyBank, Trash2, X, Upload, Download, Search, ShieldCheck,
  Flag, ClipboardCheck, FileWarning
} from "lucide-react";
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import {
  AUDIT_STATUSES,
  analyzeTransactions,
  auditSummary,
  formatMoney,
  migrateTransactions,
} from "./auditEngine";

const INK="#16261F", PAPER="#FAF8F2", LINE="#DED7C4", EMERALD="#1F6F5C";
const EMERALD_SOFT="#E4EEE9", RUST="#B3452E", RUST_SOFT="#F5E4DE";
const GOLD="#B98A2E", GOLD_SOFT="#F3E9D3", SLATE="#6B7268";

const CATEGORIES=["Groceries","Rent","Utilities","Transport","Dining","Entertainment","Healthcare","Shopping","Other"];
const CAT_COLORS={Groceries:"#1F6F5C",Rent:"#16261F",Utilities:"#5C7A6B",Transport:"#B98A2E",Dining:"#B3452E",Entertainment:"#8C6B9E",Healthcare:"#3E7CA6",Shopping:"#C77B4B",Other:"#9B9587"};
const PAY_MODES=["UPI","Card","Cash","Bank Transfer"];
const STORAGE_KEY="incoaudit_transactions_v3";

function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function monthLabel(k){const [y,m]=k.split("-");return new Date(+y,+m-1,1).toLocaleString("en-US",{month:"short"})}
function uid(){return Math.random().toString(36).slice(2,10)}
function fmt(n){return formatMoney(n)}

function buildSeed(){
  const today=new Date(), months=[];
  for(let i=4;i>=0;i--) months.push(new Date(today.getFullYear(),today.getMonth()-i,1));
  const base={Rent:18000,Utilities:2600,Groceries:7200,Transport:3100,Dining:2400,Entertainment:1500,Healthcare:900,Shopping:3600,Other:1100};
  return months.flatMap((m,idx)=>[
    ...CATEGORIES.map((cat)=>({
      id:uid(),type:"expense",amount:Math.round(Math.max(200,base[cat]+idx*120)),
      category:cat,date:new Date(m.getFullYear(),m.getMonth(),Math.min(3+cat.length,27)).toISOString().slice(0,10),
      mode:PAY_MODES[cat.length%PAY_MODES.length],note:cat==="Rent"?"Monthly rent":"",
      auditStatus:AUDIT_STATUSES.PENDING,auditFlags:[],auditNote:"",reviewedAt:null
    })),
    {id:uid(),type:"income",amount:62000,category:"Salary",date:new Date(m.getFullYear(),m.getMonth(),1).toISOString().slice(0,10),mode:"Bank Transfer",note:"Monthly salary",auditStatus:AUDIT_STATUSES.REVIEWED,auditFlags:[],auditNote:"",reviewedAt:null}
  ]);
}

function loadTransactions(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw) return analyzeTransactions(JSON.parse(raw));
  }catch{}
  return analyzeTransactions(buildSeed());
}

export default function IncoAudit(){
  const [tab,setTab]=useState("dashboard");
  const [txns,setTxns]=useState(loadTransactions);
  const [query,setQuery]=useState("");
  const [auditFilter,setAuditFilter]=useState("all");
  const [showAdd,setShowAdd]=useState(false);
  const [showReview,setShowReview]=useState(null);
  const [showImport,setShowImport]=useState(false);
  const [goals,setGoals]=useState([{id:uid(),name:"Emergency Fund",target:100000,saved:34000},{id:uid(),name:"New Laptop",target:60000,saved:21000}]);

  const budgets={Groceries:8000,Rent:18000,Utilities:3000,Transport:3500,Dining:2800,Entertainment:2000,Healthcare:1500,Shopping:4000,Other:1500};

  function persist(next){
    const clean=migrateTransactions(next);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(clean));
    setTxns(analyzeTransactions(clean));
  }
  function updateTxn(id,patch){persist(txns.map(t=>t.id===id?{...t,...patch}:t))}
  function addTxn(t){persist([{...t,id:uid(),auditStatus:AUDIT_STATUSES.PENDING,auditFlags:[],auditNote:"",reviewedAt:null},...txns]);setShowAdd(false)}
  function deleteTxn(id){persist(txns.filter(t=>t.id!==id))}
  function reviewTxn(id,status,note){
    updateTxn(id,{auditStatus:status,auditNote:note,reviewedAt:new Date().toISOString()});
    setShowReview(null);
  }
  function exportBackup(){
    const blob=new Blob([JSON.stringify({app:"IncoAudit",version:3,exportedAt:new Date().toISOString(),transactions:txns},null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`incoaudit-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
  }
  function importBackup(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const data=JSON.parse(e.target.result);
        const imported=Array.isArray(data)?data:data.transactions;
        if(!Array.isArray(imported)) throw new Error("No transactions found");
        persist(imported);
        setShowImport(false);
        alert(`Imported ${imported.length} transactions successfully.`);
      }catch(err){alert("Invalid backup: "+err.message)}
    };
    reader.readAsText(file);
  }

  const months=useMemo(()=>Array.from(new Set(txns.map(t=>monthKey(new Date(t.date)))).values()).sort(),[txns]);
  const currentMonth=months.at(-1);
  const expenses=txns.filter(t=>t.type==="expense");
  const currentExpenses=expenses.filter(t=>monthKey(new Date(t.date))===currentMonth);
  const currentSpend=currentExpenses.reduce((a,t)=>a+t.amount,0);
  const currentIncome=txns.filter(t=>t.type==="income"&&monthKey(new Date(t.date))===currentMonth).reduce((a,t)=>a+t.amount,0);
  const byCat={};currentExpenses.forEach(t=>byCat[t.category]=(byCat[t.category]||0)+t.amount);
  const pieData=CATEGORIES.map(c=>({name:c,value:byCat[c]||0})).filter(x=>x.value);
  const monthlySeries=months.map(m=>({month:monthLabel(m),income:txns.filter(t=>t.type==="income"&&monthKey(new Date(t.date))===m).reduce((a,t)=>a+t.amount,0),spend:expenses.filter(t=>monthKey(new Date(t.date))===m).reduce((a,t)=>a+t.amount,0)}));
  const summary=useMemo(()=>auditSummary(txns),[txns]);
  const searchable=txns.filter(t=>`${t.category} ${t.note} ${t.date} ${t.mode}`.toLowerCase().includes(query.toLowerCase()));
  const auditRows=searchable.filter(t=>auditFilter==="all"||t.auditStatus===auditFilter||(auditFilter==="anomaly"&&t.auditFlags?.length));

  const NAV=[
    ["dashboard","Dashboard",LayoutDashboard],["ledger","Ledger",BookOpen],["audit","Audit",ShieldCheck],
    ["predictions","Predictions",TrendingUp],["alerts","Alerts",Bell],["goals","Goals",Target],["settings","Budgets",Settings]
  ];

  return <div style={{fontFamily:"IBM Plex Sans,system-ui",background:PAPER,color:INK,minHeight:"100vh",display:"flex"}}>
    <style>{`*{box-sizing:border-box}button{font-family:inherit} .card{background:#fff;border:1px solid ${LINE};border-radius:10px}.btn{cursor:pointer;border:0}.input{border:1px solid ${LINE};border-radius:6px;padding:8px 10px;font:inherit;background:#fff;color:${INK}}`}</style>

    <aside style={{width:220,borderRight:`1px solid ${LINE}`,padding:22,display:"flex",flexDirection:"column"}}>
      <div style={{fontSize:20,fontWeight:700,marginBottom:25}}>IncoAudit</div>
      {NAV.map(([id,label,Icon])=><button key={id} className="btn" onClick={()=>setTab(id)} style={{display:"flex",gap:10,alignItems:"center",padding:"10px",marginBottom:4,borderRadius:7,textAlign:"left",background:tab===id?EMERALD_SOFT:"transparent",color:tab===id?EMERALD:INK}}>
        <Icon size={16}/>{label}{id==="audit"&&summary.flagged>0&&<span style={{marginLeft:"auto",background:RUST,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10}}>{summary.flagged}</span>}
      </button>)}
      <div style={{marginTop:"auto",fontSize:11,color:SLATE}}>Phase 3 · Audit Intelligence</div>
    </aside>

    <main style={{flex:1,padding:"28px 34px",minWidth:0}}>
      {tab==="dashboard"&&<Dashboard currentIncome={currentIncome} currentSpend={currentSpend} monthlySeries={monthlySeries} pieData={pieData} txns={txns} setShowAdd={setShowAdd} summary={summary}/>}
      {tab==="ledger"&&<Ledger txns={searchable} query={query} setQuery={setQuery} setShowAdd={setShowAdd} deleteTxn={deleteTxn} setShowImport={setShowImport} exportBackup={exportBackup} onReview={setShowReview}/>}
      {tab==="audit"&&<AuditPage rows={auditRows} filter={auditFilter} setFilter={setAuditFilter} summary={summary} onReview={setShowReview}/>}
      {tab==="predictions"&&<Predictions txns={txns}/>}
      {tab==="alerts"&&<Alerts txns={txns} budgets={budgets}/>}
      {tab==="goals"&&<Goals goals={goals} setGoals={setGoals}/>}
      {tab==="settings"&&<Budgets budgets={budgets}/>}
    </main>

    {showAdd&&<AddModal close={()=>setShowAdd(false)} add={addTxn}/>}
    {showReview&&<ReviewModal txn={showReview} close={()=>setShowReview(null)} review={reviewTxn}/>}
    {showImport&&<ImportModal close={()=>setShowImport(false)} importBackup={importBackup}/>}
  </div>
}

function Title({eyebrow,title,action}){return <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",marginBottom:18}}><div><div style={{fontSize:10,color:SLATE,textTransform:"uppercase",letterSpacing:".12em"}}>{eyebrow}</div><h1 style={{fontFamily:"Georgia,serif",fontSize:25,margin:"4px 0"}}>{title}</h1></div>{action}</div>}
function Stat({label,value,color=INK,sub}){return <div className="card" style={{padding:16,flex:1}}><div style={{fontSize:10,color:SLATE,textTransform:"uppercase"}}>{label}</div><div style={{fontSize:21,fontWeight:700,color,marginTop:5}}>{value}</div>{sub&&<div style={{fontSize:11,color:SLATE}}>{sub}</div>}</div>}

function Dashboard({currentIncome,currentSpend,monthlySeries,pieData,txns,setShowAdd,summary}){
  return <><Title eyebrow="Overview" title="Dashboard" action={<button className="btn" onClick={()=>setShowAdd(true)} style={{background:INK,color:"#fff",padding:"9px 14px",borderRadius:7}}><Plus size={14}/> Log transaction</button>}/>
  <div style={{display:"flex",gap:12,marginBottom:18}}><Stat label="Income" value={fmt(currentIncome)} color={EMERALD}/><Stat label="Spend" value={fmt(currentSpend)} color={RUST}/><Stat label="Net" value={fmt(currentIncome-currentSpend)} color={currentIncome>=currentSpend?EMERALD:RUST}/><Stat label="Audit pending" value={summary.pending} color={GOLD}/></div>
  <div style={{display:"flex",gap:12}}><div className="card" style={{padding:18,flex:1.5}}><b>Cashflow trend</b><ResponsiveContainer width="100%" height={250}><LineChart data={monthlySeries}><CartesianGrid stroke={LINE}/><XAxis dataKey="month"/><YAxis/><Tooltip/><Legend/><Line dataKey="income" stroke={EMERALD}/><Line dataKey="spend" stroke={RUST}/></LineChart></ResponsiveContainer></div><div className="card" style={{padding:18,flex:1}}><b>Category split</b><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85}>{pieData.map((x,i)=><Cell key={i} fill={CAT_COLORS[x.name]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></div></div>
  <div className="card" style={{padding:18,marginTop:12}}><b>Recent transactions</b>{txns.slice(0,6).map(t=><TxnRow key={t.id} t={t}/>)}</div></>
}

function TxnRow({t,onReview,onDelete}){
  const income=t.type==="income";
  return <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px dashed ${LINE}`}}>
    <div style={{flex:1}}><b style={{fontSize:12.5}}>{income?(t.note||"Income"):t.category}</b><div style={{fontSize:10.5,color:SLATE}}>{t.date} · {t.mode}{t.auditFlags?.length>0&&" · ⚠ "+t.auditFlags.length+" issue(s)"}</div></div>
    <span style={{fontWeight:700,color:income?EMERALD:INK}}>{income?"+":"−"}{fmt(t.amount)}</span>
    {onReview&&<button className="btn" onClick={()=>onReview(t)} style={{padding:5,background:"transparent"}}><ClipboardCheck size={14}/></button>}
    {onDelete&&<button className="btn" onClick={()=>onDelete(t.id)} style={{padding:5,background:"transparent",color:SLATE}}><Trash2 size={14}/></button>}
  </div>
}

function Ledger({txns,query,setQuery,setShowAdd,deleteTxn,setShowImport,exportBackup,onReview}){
  return <><Title eyebrow={`${txns.length} entries`} title="Digital Ledger" action={<div style={{display:"flex",gap:7}}><button className="btn" onClick={setShowImport} style={{background:EMERALD_SOFT,color:EMERALD,padding:9,borderRadius:7}}><Upload size={14}/> Import</button><button className="btn" onClick={exportBackup} style={{background:GOLD_SOFT,color:GOLD,padding:9,borderRadius:7}}><Download size={14}/> Export</button><button className="btn" onClick={()=>setShowAdd(true)} style={{background:INK,color:"#fff",padding:9,borderRadius:7}}><Plus size={14}/> Add</button></div>}/>
  <div style={{marginBottom:10}}><input className="input" placeholder="Search transactions..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
  <div className="card" style={{padding:"8px 18px",maxHeight:600,overflow:"auto"}}>{txns.map(t=><TxnRow key={t.id} t={t} onReview={onReview} onDelete={deleteTxn}/>)}</div></>
}

function AuditPage({rows,filter,setFilter,summary,onReview}){
  return <><Title eyebrow="Transaction Verification" title="Audit Intelligence"/>
  <div style={{display:"flex",gap:10,marginBottom:15}}><Stat label="Total" value={summary.total}/><Stat label="Pending" value={summary.pending} color={GOLD}/><Stat label="Flagged" value={summary.flagged} color={RUST}/><Stat label="Reviewed" value={summary.reviewed} color={EMERALD}/><Stat label="Anomalies" value={summary.anomalyCount} color={RUST}/></div>
  <div className="card" style={{padding:15,marginBottom:12,display:"flex",gap:7}}>{["all","pending","flagged","reviewed","anomaly"].map(x=><button key={x} className="btn" onClick={()=>setFilter(x)} style={{padding:"7px 12px",borderRadius:6,background:filter===x?INK:"#F1EFE8",color:filter===x?"#fff":INK,textTransform:"capitalize"}}>{x}</button>)}</div>
  <div style={{display:"flex",flexDirection:"column",gap:10}}>{rows.filter(t=>t.type==="expense").map(t=><AuditCard key={t.id} t={t} onReview={onReview}/>)}</div></>
}

function AuditCard({t,onReview}){
  const status=t.auditStatus||AUDIT_STATUSES.PENDING;
  const color=status==="flagged"?RUST:status==="reviewed"?EMERALD:GOLD;
  return <div className="card" style={{padding:16,borderLeft:`4px solid ${color}`}}><div style={{display:"flex",justifyContent:"space-between"}}><div><b>{t.category}</b><div style={{fontSize:11,color:SLATE}}>{t.date} · {t.mode} · {t.note||"No note"}</div></div><b>{fmt(t.amount)}</b></div>
  {t.auditFlags?.length>0&&<div style={{marginTop:10,background:RUST_SOFT,padding:10,borderRadius:6}}>{t.auditFlags.map((f,i)=><div key={i} style={{fontSize:12}}><b>⚠ {f.title}</b><div>{f.reason}</div></div>)}</div>}
  {t.auditNote&&<div style={{fontSize:11.5,color:SLATE,marginTop:8}}>Audit note: {t.auditNote}</div>}
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}><span style={{color,fontWeight:700,fontSize:11,textTransform:"uppercase"}}>{status}</span><button className="btn" onClick={()=>onReview(t)} style={{background:INK,color:"#fff",padding:"7px 12px",borderRadius:6}}>{status==="pending"?"Review":"Update audit"}</button></div></div>
}

function ReviewModal({txn,close,review}){
  const [note,setNote]=useState(txn.auditNote||"");
  return <Modal title="Review transaction" close={close}><div style={{fontSize:13,lineHeight:1.7}}><b>{txn.category}</b><br/>{txn.date} · {txn.mode}<br/><strong style={{fontSize:22}}>{fmt(txn.amount)}</strong></div>
  {txn.auditFlags?.length>0&&<div style={{background:RUST_SOFT,padding:10,borderRadius:6,margin:"12px 0"}}>{txn.auditFlags.map((f,i)=><div key={i}><b>⚠ {f.title}</b><div style={{fontSize:12}}>{f.reason}</div></div>)}</div>}
  <label style={{fontSize:11,color:SLATE}}>Audit note<input className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Verified from statement" style={{marginTop:4}}/></label>
  <div style={{display:"flex",gap:8,marginTop:14}}><button className="btn" onClick={()=>review(txn.id,AUDIT_STATUSES.REVIEWED,note)} style={{flex:1,background:EMERALD,color:"#fff",padding:10,borderRadius:6}}><CheckCircle2 size={14}/> Mark reviewed</button><button className="btn" onClick={()=>review(txn.id,AUDIT_STATUSES.FLAGGED,note)} style={{flex:1,background:RUST,color:"#fff",padding:10,borderRadius:6}}><Flag size={14}/> Flag</button></div>
  </Modal>
}

function Modal({title,close,children}){return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}} onClick={close}><div className="card" style={{width:430,padding:20}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",marginBottom:15}}><b>{title}</b><button className="btn" onClick={close} style={{background:"transparent"}}><X size={16}/></button></div>{children}</div></div>}

function AddModal({close,add}){
  const [amount,setAmount]=useState(""),[category,setCategory]=useState(CATEGORIES[0]),[mode,setMode]=useState("UPI"),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[note,setNote]=useState("");
  return <Modal title="Add transaction" close={close}><div style={{display:"grid",gap:10}}><input className="input" type="number" placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)}/><select className="input" value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><select className="input" value={mode} onChange={e=>setMode(e.target.value)}>{PAY_MODES.map(m=><option key={m}>{m}</option>)}</select><input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/><input className="input" placeholder="Merchant/note" value={note} onChange={e=>setNote(e.target.value)}/><button className="btn" onClick={()=>amount>0&&add({type:"expense",amount:Number(amount),category,mode,date,note})} style={{background:EMERALD,color:"#fff",padding:10,borderRadius:6}}>Add transaction</button></div></Modal>
}

function ImportModal({close,importBackup}){const [file,setFile]=useState(null);return <Modal title="Import backup" close={close}><p style={{fontSize:12,color:SLATE}}>Upload an IncoAudit JSON backup. The imported transactions become the active local dataset.</p><input type="file" accept=".json,application/json" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="btn" disabled={!file} onClick={()=>file&&importBackup(file)} style={{marginTop:15,width:"100%",background:EMERALD,color:"#fff",padding:10,borderRadius:6}}>Load backup</button></Modal>}

function Predictions({txns}){const data=CATEGORIES.map(c=>({category:c,last:txns.filter(t=>t.type==="expense"&&t.category===c).slice(-5).reduce((a,t)=>a+t.amount,0)}));return <><Title eyebrow="Predictive Analytics" title="Spending Overview"/><div className="card" style={{padding:18}}><ResponsiveContainer width="100%" height={320}><BarChart data={data}><CartesianGrid stroke={LINE}/><XAxis dataKey="category" angle={-20} textAnchor="end" height={60}/><YAxis/><Tooltip/><Bar dataKey="last" fill={EMERALD}/></BarChart></ResponsiveContainer></div></>}
function Alerts({txns,budgets}){const rows=CATEGORIES.map(c=>{const spent=txns.filter(t=>t.type==="expense"&&t.category===c).reduce((a,t)=>a+t.amount,0);return {c,spent,limit:budgets[c]}}).filter(x=>x.spent>=x.limit*.8);return <><Title eyebrow="Budget monitoring" title="Alerts"/>{rows.map(x=><div className="card" key={x.c} style={{padding:14,marginBottom:8}}><b>{x.c}</b><span style={{float:"right"}}>{fmt(x.spent)} / {fmt(x.limit)}</span></div>)}</>}
function Goals({goals,setGoals}){return <><Title eyebrow="Savings" title="Goals"/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{goals.map(g=><div className="card" style={{padding:18}} key={g.id}><b>{g.name}</b><div style={{margin:"10px 0"}}>{fmt(g.saved)} / {fmt(g.target)}</div><div style={{height:8,background:LINE,borderRadius:5}}><div style={{height:"100%",width:`${Math.min(100,g.saved/g.target*100)}%`,background:GOLD}}/></div><button className="btn" onClick={()=>setGoals(gs=>gs.map(x=>x.id===g.id?{...x,saved:x.saved+1000}:x))} style={{marginTop:10,padding:7,background:GOLD_SOFT}}>+ ₹1,000</button></div>)}</div></>}
function Budgets({budgets}){return <><Title eyebrow="Budget settings" title="Category Budgets"/><div className="card" style={{padding:18}}>{CATEGORIES.map(c=><div key={c} style={{display:"flex",justifyContent:"space-between",padding:10,borderBottom:`1px solid ${LINE}`}}><b>{c}</b><span>{fmt(budgets[c])}</span></div>)}</div></>}
