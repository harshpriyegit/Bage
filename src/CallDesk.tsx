import {useMemo,useRef,useState,type DragEvent} from 'react';
import {Phone,PhoneMissed,CheckCircle2,Clock3,Timer,ImagePlus,ShieldCheck,ShieldAlert,X,Trash2,ScanText,ArrowLeft,User as UserIcon,MapPin,Briefcase,StickyNote,Maximize2,Plus} from 'lucide-react';
import {api,send,fmtDuration,parseDurationInput,type Call,type Lead,type User,type ProofEntry} from './api';
import {Modal,Field,Badge,Empty,today} from './components';
import './calldesk.css';

type Kind='Called Today'|'No Answer'|'Successful';
const META:Record<Kind,{icon:typeof Phone;cls:string;title:string;blurb:string;match:(c:Call)=>boolean;defaultStatus:string}>={
  'Called Today':{icon:Phone,cls:'cd-called',title:'Called today',blurb:'Every call made today, who made it and for how long, with screenshot proof.',match:()=>true,defaultStatus:'Called Today'},
  'No Answer':{icon:PhoneMissed,cls:'cd-noanswer',title:'No answer',blurb:'Missed, busy or not reachable calls, with proof that the attempt was made.',match:c=>c.status==='No Answer',defaultStatus:'No Answer'},
  'Successful':{icon:CheckCircle2,cls:'cd-success',title:'Successful calls',blurb:'Calls that connected and went well, with talk time and proof.',match:c=>['Successful','Converted'].includes(c.status),defaultStatus:'Successful'},
};
const OUTCOMES=['Called Today','No Answer','Successful','Follow-up Required','Not Interested','Converted'];
const localDay=(s:string)=>{const d=new Date(s.replace(' ','T')+'Z');return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const timeOf=(s:string)=>new Date(s.replace(' ','T')+'Z').toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
const proofUrl=(id:number)=>`/api/sales/proofs/${id}/image`;

type Row={key:number;keep:boolean;lead_id:string;status:string;duration:string;notes:string;number:string;raw:string;time_text:string;guess:string};

export default function CallDesk({kind,user,leads,calls,empFilter,date,search,onChanged,notify}:{kind:Kind;user:User;leads:Lead[];calls:Call[];empFilter:string;date:string;search:string;onChanged:()=>Promise<void>;notify:(s:string)=>void}){
  const isAdmin=user.role==='Super Admin';
  const day=date||today();
  const meta=META[kind];
  const [open,setOpen]=useState<Call|null>(null),[upload,setUpload]=useState(false),[zoom,setZoom]=useState<number|null>(null),[proofOnly,setProofOnly]=useState(false);
  const shown=useMemo(()=>calls.filter(c=>localDay(c.created_at)===day&&meta.match(c)&&(!empFilter||String(c.employee_id)===empFilter)&&(!proofOnly||!c.proof_id)&&`${c.name} ${c.company} ${c.phone} ${c.employee_name} ${c.notes}`.toLowerCase().includes(search.toLowerCase())),[calls,day,meta,empFilter,proofOnly,search]);
  const talk=shown.reduce((s,c)=>s+(c.duration_seconds||0),0);
  const timed=shown.filter(c=>c.duration_seconds);
  const proved=shown.filter(c=>c.proof_id).length;
  const byEmployee=useMemo(()=>{const m=new Map<number,{name:string;calls:Call[]}>();for(const c of shown){if(!m.has(c.employee_id))m.set(c.employee_id,{name:c.employee_name,calls:[]});m.get(c.employee_id)!.calls.push(c);}return [...m.values()].sort((a,b)=>b.calls.length-a.calls.length);},[shown]);
  const stats=[{label:kind==='No Answer'?'Unanswered calls':kind==='Successful'?'Successful calls':'Calls made',value:shown.length,icon:meta.icon},{label:'Total talk time',value:fmtDuration(talk),icon:Timer},{label:'Average call',value:timed.length?fmtDuration(Math.round(talk/timed.length)):'—',icon:Clock3},{label:'With screenshot proof',value:shown.length?`${proved}/${shown.length}`:'—',icon:proved===shown.length&&shown.length?ShieldCheck:ShieldAlert,warn:shown.length>0&&proved<shown.length}];

  return <div className={`call-desk ${meta.cls}`}>
    <section className="cd-hero"><div className="cd-hero-icon"><meta.icon size={22}/></div><div className="grow"><h2>{meta.title} · {day===today()?'Today':new Date(day+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</h2><p>{meta.blurb}</p></div><button className="button primary" onClick={()=>setUpload(true)}><ImagePlus size={16}/>Upload call screenshots</button></section>
    <div className="cd-stats">{stats.map(s=><div key={s.label} className={`cd-stat ${s.warn?'warn':''}`}><s.icon size={17}/><div><strong>{s.value}</strong><span>{s.label}</span></div></div>)}</div>
    <div className="cd-toolbar"><label className="cd-check"><input type="checkbox" checked={proofOnly} onChange={e=>setProofOnly(e.target.checked)}/>Only calls missing proof</label><span className="muted">{shown.length} call{shown.length===1?'':'s'}{isAdmin&&byEmployee.length>0?` · ${byEmployee.length} employee${byEmployee.length===1?'':'s'}`:''}</span></div>
    {!shown.length?<div className="panel"><Empty title={kind==='No Answer'?'No unanswered calls':kind==='Successful'?'No successful calls yet':'No calls logged for this day'} description="Upload a screenshot of your phone's call log. Each call is read from it and saved with the screenshot attached as proof." action={<button className="button primary" onClick={()=>setUpload(true)}><ImagePlus size={15}/>Upload screenshot</button>}/></div>:
    byEmployee.map(g=><div className="panel cd-group" key={g.name}><div className="cd-group-head"><div className="cd-avatar">{g.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div><div className="grow"><strong>{g.name}</strong><span className="muted">{g.calls.length} call{g.calls.length===1?'':'s'} · talk time {fmtDuration(g.calls.reduce((s,c)=>s+(c.duration_seconds||0),0))} · proof {g.calls.filter(c=>c.proof_id).length}/{g.calls.length}</span></div></div>
      <div className="table-scroll"><table className="cd-table"><thead><tr><th>Time</th><th>Called whom</th><th>Number dialled</th><th>Duration</th><th>Outcome</th><th>Proof</th><th/></tr></thead><tbody>{g.calls.map(c=><tr key={c.id} className="cd-row" onClick={()=>setOpen(c)}><td className="nowrap">{timeOf(c.created_at)}</td><td><strong>{c.name}</strong><div className="task-id">{c.company||c.business||'—'}</div></td><td className="nowrap">{c.dialed_number||c.phone}</td><td><span className={`cd-duration ${c.duration_seconds?'':'none'}`}><Timer size={12}/>{fmtDuration(c.duration_seconds)}</span></td><td><Badge value={c.status}/></td><td>{c.proof_id?<button className="cd-thumb" aria-label={'View proof for call with '+c.name} onClick={e=>{e.stopPropagation();setZoom(c.proof_id);}}><img src={proofUrl(c.proof_id)} alt="" loading="lazy"/></button>:<span className="cd-noproof"><ShieldAlert size={12}/>No proof</span>}</td><td><button className="button small" onClick={e=>{e.stopPropagation();setOpen(c);}}>Details</button></td></tr>)}</tbody></table></div></div>)}

    {open&&<CallDetail call={open} onClose={()=>setOpen(null)} onZoom={setZoom}/>}
    {zoom!=null&&<div className="cd-lightbox" role="dialog" aria-label="Screenshot proof" onClick={()=>setZoom(null)}><button className="icon-button" aria-label="Close" onClick={()=>setZoom(null)}><X size={20}/></button><img src={proofUrl(zoom)} alt="Call screenshot proof" onClick={e=>e.stopPropagation()}/></div>}
    {upload&&<ProofUpload kind={kind} leads={leads} onClose={()=>setUpload(false)} onSaved={async n=>{await onChanged();notify(`${n} call${n===1?'':'s'} saved with proof`);}}/>}
  </div>;
}

function CallDetail({call:c,onClose,onZoom}:{call:Call;onClose:()=>void;onZoom:(id:number)=>void}){
  return <div className="cd-drawer-wrap" onClick={onClose}><aside className="cd-drawer" role="dialog" aria-label={'Call with '+c.name} onClick={e=>e.stopPropagation()}>
    <div className="cd-drawer-head"><button className="icon-button" aria-label="Back" onClick={onClose}><ArrowLeft size={18}/></button><div className="grow"><span className="eyebrow">CALL DETAIL · #{c.id}</span><h2>{c.name}</h2></div><Badge value={c.status}/></div>
    <div className="cd-facts">
      <div><UserIcon size={14}/><span>Called by</span><strong>{c.employee_name}</strong></div>
      <div><Clock3 size={14}/><span>When</span><strong>{new Date(c.created_at.replace(' ','T')+'Z').toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}</strong></div>
      <div><Timer size={14}/><span>Duration</span><strong>{fmtDuration(c.duration_seconds)}</strong></div>
      <div><Phone size={14}/><span>Number</span><strong><a href={'tel:'+(c.dialed_number||c.phone)}>{c.dialed_number||c.phone}</a></strong></div>
      {c.address&&<div><MapPin size={14}/><span>Address</span><strong>{c.address}</strong></div>}
      {c.business&&<div><Briefcase size={14}/><span>Work</span><strong>{c.business}</strong></div>}
    </div>
    {c.special_note&&<div className="cd-note"><StickyNote size={14}/>{c.special_note}</div>}
    {(c.notes||c.next_action||c.interest||c.requirements)&&<div className="cd-section"><h3>Call notes</h3>{c.notes&&<p>{c.notes}</p>}{c.interest&&<p><b>Interest:</b> {c.interest}</p>}{c.requirements&&<p><b>Requirements:</b> {c.requirements}</p>}{c.next_action&&<p><b>Next action:</b> {c.next_action}</p>}{c.follow_up&&<p><b>Follow-up:</b> {c.follow_up}</p>}</div>}
    <div className="cd-section"><h3>Screenshot proof {c.source==='screenshot'&&<span className="cd-tag"><ScanText size={11}/>read from screenshot</span>}</h3>{c.proof_id?<button className="cd-proof-full" onClick={()=>onZoom(c.proof_id!)} aria-label="Open screenshot full size"><img src={proofUrl(c.proof_id)} alt="Call screenshot proof"/><span><Maximize2 size={13}/>Full size</span></button>:<div className="cd-noproof big"><ShieldAlert size={16}/>No screenshot was attached to this call.</div>}</div>
  </aside></div>;
}

function ProofUpload({kind,leads,onClose,onSaved}:{kind:Kind;leads:Lead[];onClose:()=>void;onSaved:(n:number)=>Promise<void>}){
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[proofId,setProofId]=useState<number|null>(null),[rows,setRows]=useState<Row[]>([]),[ocr,setOcr]=useState(''),[showText,setShowText]=useState(false),[drag,setDrag]=useState(false);
  const input=useRef<HTMLInputElement>(null);const keyRef=useRef(0);
  const callable=leads; // server already limits employees to their assigned leads
  const defaultStatus=META[kind].defaultStatus;
  const pick=(f?:File|null)=>{if(!f)return;if(!/^image\/(png|jpe?g|webp)$/.test(f.type)){setError('Use a PNG, JPG or WebP screenshot');return;}setError('');setFile(f);setPreview(URL.createObjectURL(f));};
  const onDrop=(e:DragEvent)=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0]);};
  const toRow=(e:Partial<ProofEntry>):Row=>({key:++keyRef.current,keep:!!e.lead_id,lead_id:e.lead_id?String(e.lead_id):'',status:kind==='Called Today'?(e.status||defaultStatus):defaultStatus,duration:e.duration_seconds!=null?fmtDuration(e.duration_seconds).replace('—',''):'',notes:'',number:e.number||'',raw:e.raw||'',time_text:e.time_text||'',guess:e.status||''});
  async function read(){if(!file)return;setBusy(true);setError('');try{const fd=new FormData();fd.append('file',file);const r=await api('/sales/proofs',{method:'POST',body:fd});setProofId(r.id);setOcr(r.text||'');const entries:ProofEntry[]=r.entries||[];setRows(entries.length?entries.map(toRow):[toRow({})]);if(r.ocrError)setError(r.ocrError);else if(!entries.length)setError('No phone numbers or lead names were found in this screenshot. Pick the lead and fill in the details below.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const update=(k:number,patch:Partial<Row>)=>setRows(rs=>rs.map(r=>r.key===k?{...r,...patch}:r));
  const valid=rows.filter(r=>r.keep&&r.lead_id);
  async function save(){setBusy(true);setError('');try{const bad=valid.find(r=>r.duration&&parseDurationInput(r.duration)==null);if(bad){setError(`Couldn't understand the duration "${bad.duration}". Use 5:23, 5m 23s or 45s.`);return;}const r=await send(`/sales/proofs/${proofId}/calls`,{calls:valid.map(r=>({lead_id:Number(r.lead_id),status:r.status,duration_seconds:parseDurationInput(r.duration),notes:r.notes,dialed_number:r.number}))});await onSaved(r.saved);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

  return <Modal title="Add call proof" subtitle="Upload a screenshot of your call log or call screen. The number, duration and outcome are read automatically." wide onClose={onClose}>
    {proofId==null?<div className="cd-upload">
      <div className={`upload-zone intake-drop ${drag?'dragging':''} ${file?'has-file':''}`} role="button" tabIndex={0} onClick={()=>input.current?.click()} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')input.current?.click();}} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}>
        {preview?<img className="cd-upload-preview" src={preview} alt="Selected screenshot"/>:<><ImagePlus size={32}/><h3>Drop a call screenshot</h3><p>Call log / recents list, in-call screen or call details<br/>PNG, JPG or WebP · up to 8 MB</p></>}
        <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>pick(e.target.files?.[0])}/>
      </div>
      <div className="intake-how"><ScanText size={15}/><span>We read the <b>phone number</b> (or saved contact name), the <b>duration</b> ("5:23", "5m 23s", "2 min"), and the <b>outcome</b>: "missed", "busy", "declined" or a 0s call means <b>No answer</b>, and a call with talk time means it <b>connected</b>. You can check everything before saving.</span></div>
      {error&&<div className="error">{error}</div>}
      <div className="modal-footer">{file&&<button className="button" onClick={()=>{setFile(null);setPreview('');}}>Choose another</button>}<button className="button primary" disabled={!file||busy} onClick={()=>void read()}><ScanText size={15}/>{busy?'Reading screenshot…':'Read screenshot'}</button></div>
    </div>:<div className="cd-review">
      <div className="cd-review-grid">
        <div className="cd-review-shot"><img src={proofUrl(proofId)} alt="Uploaded screenshot"/><button className="text-button" onClick={()=>setShowText(v=>!v)}>{showText?'Hide':'Show'} text that was read</button>{showText&&<pre className="cd-ocr">{ocr||'(no text found)'}</pre>}</div>
        <div className="cd-review-rows">
          <p className="form-hint">Check each call. Rows matched to one of your leads are ticked. Unmatched numbers need you to pick the lead.</p>
          {rows.map(r=><div key={r.key} className={`cd-entry ${r.keep?'':'off'}`}>
            <div className="cd-entry-top"><input type="checkbox" aria-label="Include call" checked={r.keep} onChange={e=>update(r.key,{keep:e.target.checked})}/>{r.number&&<span className="cd-num"><Phone size={12}/>{r.number}</span>}{r.time_text&&<span className="muted">{r.time_text}</span>}{r.guess&&<span className={`cd-guess ${r.guess==='No Answer'?'miss':'ok'}`}>{r.guess==='No Answer'?'looks unanswered':'looks connected'}</span>}<button className="icon-button" aria-label="Remove" onClick={()=>setRows(rs=>rs.filter(x=>x.key!==r.key))}><Trash2 size={14}/></button></div>
            {r.raw&&<div className="cd-raw">“{r.raw}”</div>}
            <div className="cd-entry-fields">
              <Field label="Lead"><select value={r.lead_id} onChange={e=>update(r.key,{lead_id:e.target.value,keep:!!e.target.value})}><option value="">Select lead…</option>{callable.map(l=><option key={l.id} value={l.id}>{l.name} · {l.phone}</option>)}</select></Field>
              <Field label="Outcome"><select value={r.status} onChange={e=>update(r.key,{status:e.target.value})}>{OUTCOMES.map(s=><option key={s}>{s}</option>)}</select></Field>
              <Field label="Duration"><input value={r.duration} placeholder="5:23 or 5m 23s" onChange={e=>update(r.key,{duration:e.target.value})}/></Field>
              <Field label="Note" full><input value={r.notes} placeholder="Optional" onChange={e=>update(r.key,{notes:e.target.value})}/></Field>
            </div>
          </div>)}
          <button className="button small" onClick={()=>setRows(rs=>[...rs,toRow({})])}><Plus size={14}/>Add a call by hand</button>
        </div>
      </div>
      {error&&<div className="error">{error}</div>}
      <div className="modal-footer"><span className="muted grow">The screenshot is attached to every call you save. Only you and the admin can see it.</span><button className="button primary" disabled={busy||!valid.length} onClick={()=>void save()}>{busy?'Saving…':`Save ${valid.length} call${valid.length===1?'':'s'} with proof`}</button></div>
    </div>}
  </Modal>;
}
