import {useCallback,useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,X,Timer,ScanText,Download,ShieldAlert} from 'lucide-react';
import {api,fmtDuration,type User} from './api';
import {Badge,Empty,SearchInput} from './components';
import './calldesk.css';

type ProofCall={id:number;status:string;duration_seconds:number|null;dialed_number:string;created_at:string;name:string;phone:string;company:string};
type Proof={id:number;employee_id:number;employee_name:string;original_name:string;created_at:string;calls:ProofCall[]};
const url=(id:number)=>`/api/sales/proofs/${id}/image`;
const when=(s:string)=>new Date(s.replace(' ','T')+'Z');
const dayKey=(s:string)=>{const d=when(s);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

/** Every call screenshot uploaded as proof, grouped by day, with a full-screen viewer. */
export default function ProofGallery({user,empFilter,date}:{user:User;empFilter:string;date:string}){
  const isAdmin=user.role==='Super Admin';
  const [proofs,setProofs]=useState<Proof[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[unlinked,setUnlinked]=useState(false),[idx,setIdx]=useState<number|null>(null);
  const load=useCallback(async()=>{try{setProofs(await api('/sales/proofs'));setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const shown=useMemo(()=>{const q=search.toLowerCase();return proofs.filter(p=>(!empFilter||String(p.employee_id)===empFilter)&&(!date||dayKey(p.created_at)===date)&&(!unlinked||!p.calls.length)&&(!q||`${p.employee_name} ${p.original_name} ${p.calls.map(c=>`${c.name} ${c.phone} ${c.dialed_number} ${c.company}`).join(' ')}`.toLowerCase().includes(q)));},[proofs,empFilter,date,unlinked,search]);
  const days=useMemo(()=>{const m=new Map<string,Proof[]>();for(const p of shown){const k=dayKey(p.created_at);m.set(k,[...(m.get(k)||[]),p]);}return [...m.entries()];},[shown]);
  const order=useMemo(()=>days.flatMap(([,l])=>l),[days]);
  const cur=idx==null?null:order[idx]??null;
  const talk=shown.reduce((s,p)=>s+p.calls.reduce((t,c)=>t+(c.duration_seconds||0),0),0);
  return <>
    <div className="cd-stats">{[{l:'Screenshots',v:shown.length},{l:'Calls proven',v:shown.reduce((s,p)=>s+p.calls.length,0)},{l:'Talk time on proof',v:fmtDuration(talk)},{l:'Not linked to a call',v:shown.filter(p=>!p.calls.length).length}].map(s=><div className="panel cd-stat" key={s.l}><span className="muted">{s.l}</span><strong>{s.v}</strong></div>)}</div>
    <div className="cd-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search lead, number or employee…"/><label className="cd-check"><input type="checkbox" checked={unlinked} onChange={e=>setUnlinked(e.target.checked)}/>Only screenshots with no saved calls</label><span className="muted">{isAdmin?'All employees’ uploads':'Your uploads'}</span></div>
    {error&&<div className="error" role="alert">{error}</div>}{loading&&<div className="loading-bar"/>}
    {!loading&&!shown.length&&<div className="panel"><Empty title={proofs.length?'No screenshots match':'No screenshots uploaded yet'} description={proofs.length?'Try another date, employee or search.':'Screenshots uploaded from Called Today, No Answer or Successful appear here.'}/></div>}
    {days.map(([d,list])=><section key={d} className="pg-day"><h2>{when(list[0].created_at).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}<span className="count">{list.length}</span></h2>
      <div className="pg-grid">{list.map(p=><button key={p.id} className="panel pg-card" onClick={()=>setIdx(order.indexOf(p))} aria-label={`Open screenshot from ${p.employee_name}`}>
        <div className="pg-img"><img src={url(p.id)} alt="" loading="lazy"/>{!p.calls.length&&<span className="pg-flag"><ShieldAlert size={11}/>No calls saved</span>}</div>
        <div className="pg-meta"><strong>{p.calls.length?p.calls.map(c=>c.name).slice(0,2).join(', ')+(p.calls.length>2?` +${p.calls.length-2}`:''):p.original_name||'Screenshot'}</strong><span className="muted">{isAdmin&&`${p.employee_name} · `}{when(p.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} · {p.calls.length} call{p.calls.length===1?'':'s'}</span></div>
      </button>)}</div></section>)}
    {cur&&<Viewer proof={cur} pos={idx!} total={order.length} isAdmin={isAdmin} onNav={d=>setIdx(i=>i==null?i:Math.min(order.length-1,Math.max(0,i+d)))} onClose={()=>setIdx(null)}/>}
  </>;
}

function Viewer({proof,pos,total,isAdmin,onNav,onClose}:{proof:Proof;pos:number;total:number;isAdmin:boolean;onNav:(d:number)=>void;onClose:()=>void}){
  const [zoom,setZoom]=useState(false),[text,setText]=useState<string|null>(null);
  useEffect(()=>{setZoom(false);setText(null);},[proof.id]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='ArrowRight')onNav(1);if(e.key==='ArrowLeft')onNav(-1);};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onNav,onClose]);
  async function showText(){if(text!=null){setText(null);return;}try{setText((await api(`/sales/proofs/${proof.id}/text`)).text||'(no text was read)');}catch(e){setText((e as Error).message);}}
  return <div className="pg-viewer" role="dialog" aria-modal="true" aria-label="Screenshot viewer">
    <div className={`pg-stage ${zoom?'zoomed':''}`} onClick={onClose}>
      <button className="icon-button pg-nav prev" aria-label="Previous screenshot" disabled={pos===0} onClick={e=>{e.stopPropagation();onNav(-1);}}><ChevronLeft size={26}/></button>
      <img src={url(proof.id)} alt="Call screenshot proof" onClick={e=>{e.stopPropagation();setZoom(z=>!z);}} title={zoom?'Click to fit':'Click to zoom'}/>
      <button className="icon-button pg-nav next" aria-label="Next screenshot" disabled={pos>=total-1} onClick={e=>{e.stopPropagation();onNav(1);}}><ChevronRight size={26}/></button>
    </div>
    <aside className="pg-side">
      <div className="pg-side-head"><div><strong>{pos+1} of {total}</strong><span className="muted">{isAdmin&&`${proof.employee_name} · `}{when(proof.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span></div><button className="icon-button" aria-label="Close viewer" onClick={onClose}><X size={18}/></button></div>
      <h3>Calls proven by this screenshot</h3>
      {proof.calls.length?<ul className="pg-calls">{proof.calls.map(c=><li key={c.id}><div><strong>{c.name}</strong><span className="muted">{c.dialed_number||c.phone}{c.company?` · ${c.company}`:''}</span></div><div className="pg-call-right"><span className="cd-duration"><Timer size={12}/>{fmtDuration(c.duration_seconds)}</span><Badge value={c.status}/></div></li>)}</ul>:<div className="cd-noproof big"><ShieldAlert size={15}/>No calls were saved from this screenshot.</div>}
      <div className="pg-side-actions"><button className="button small" onClick={()=>void showText()}><ScanText size={14}/>{text!=null?'Hide':'Show'} text read</button><a className="button small" href={url(proof.id)} download={proof.original_name||`proof-${proof.id}`}><Download size={14}/>Download</a></div>
      {text!=null&&<pre className="cd-ocr">{text}</pre>}
      <p className="muted pg-hint">← → to browse · click image to zoom · Esc to close</p>
    </aside>
  </div>;
}
