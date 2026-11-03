import {useRef,useState,type DragEvent} from 'react';
import {Upload,FileSpreadsheet,FileText,StickyNote,Wand2,Trash2,ArrowLeft,CheckCircle2,AlertTriangle,X} from 'lucide-react';
import {api,send,type Employee} from './api';
import {Field} from './components';

type Parsed={name:string;company:string;phone:string;email:string;address:string;business:string;special_note:string;issues:string[];duplicate?:boolean;keep:boolean};
const cols:[keyof Parsed,string,string][]=[['name','Name','Contact person'],['phone','Contact No','+91…'],['company','Company',''],['address','Address','Area, city'],['business','Work','What they do'],['special_note','Special note','e.g. very rich, our friend…'],['email','Email','']];
const sample=`Rahul Sharma, Sharma Traders Pvt Ltd, +91 98765 43210, MG Road Pune, electronics wholesaler

Name: Priya Mehta
Phone: 98111 22233
Address: 45 Park Street, Kolkata
Business: Bakery owner
Note: very rich, owns 3 outlets`;
const fileIcon=(n:string)=>/\.pdf$/i.test(n)?FileText:FileSpreadsheet;

export default function LeadIntake({employees,onDone,onClose}:{employees:Employee[];onDone:(n:number)=>Promise<void>|void;onClose:()=>void}){
  const [file,setFile]=useState<File|null>(null),[text,setText]=useState(''),[rows,setRows]=useState<Parsed[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[drag,setDrag]=useState(false),[assignee,setAssignee]=useState(''),[result,setResult]=useState<{imported:number;errors:{row:number;error:string}[]}|null>(null),[info,setInfo]=useState('');
  const input=useRef<HTMLInputElement>(null);
  const pick=(f?:File|null)=>{if(!f)return;if(!/\.(csv|xlsx|xls|ods|pdf|txt)$/i.test(f.name)){setError('Use an Excel, CSV/Sheet, PDF or TXT file');return;}setError('');setFile(f);};
  const onDrop=(e:DragEvent)=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0]);};
  async function convert(){setError('');setBusy(true);try{const fd=new FormData();if(file)fd.append('file',file);fd.append('text',text);const r=await api('/sales/import/parse',{method:'POST',body:fd});if(!r.leads.length){setError('No leads could be found. Make sure each lead has at least a phone number or a name.');return;}setRows(r.leads.map((l:Parsed)=>({...l,keep:!l.duplicate&&!!l.phone})));setInfo(`Found ${r.leads.length} lead${r.leads.length===1?'':'s'} from ${r.sources.join(' + ')}${r.truncated?' (first 1,000 shown)':''}.`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const update=(i:number,k:keyof Parsed,v:string|boolean)=>setRows(rs=>rs!.map((r,j)=>j===i?{...r,[k]:v}:r));
  const rowStatus=(r:Parsed)=>{const digits=r.phone.replace(/[^\d]/g,'');if(!r.name.trim())return 'Needs name';if(digits.length<5)return 'Needs phone';if(r.duplicate)return 'Already exists';return 'Ready';};
  const ready=rows?.filter(r=>r.keep&&rowStatus(r)==='Ready')||[];
  async function importRows(){setError('');setBusy(true);try{const res=await send('/sales/import',{employee_id:assignee?Number(assignee):null,rows:ready.map(({name,company,phone,email,address,business,special_note})=>({name,company,phone,email:/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)?email:'',address,business,special_note}))});setResult(res);await onDone(res.imported);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

  if(result)return <div className="intake-result"><CheckCircle2 size={40} className="green"/><h3>{result.imported} lead{result.imported===1?'':'s'} added to your pipeline</h3>{result.errors.length>0&&<><p className="muted">{result.errors.length} skipped:</p>{result.errors.map((e,i)=><div className="validation-row" key={i}>Row {e.row-1}: {e.error}</div>)}</>}<div className="modal-footer"><button className="button" onClick={()=>{setRows(null);setResult(null);setFile(null);setText('');}}>Add more</button><button className="button primary" onClick={onClose}>Done</button></div></div>;

  if(rows)return <div className="intake-review"><div className="intake-review-top"><button className="button small" onClick={()=>setRows(null)}><ArrowLeft size={14}/>Back</button><span className="muted">{info} Check and fix anything below; every cell is editable.</span></div>
    <div className="table-scroll intake-table"><table><thead><tr><th><input type="checkbox" aria-label="Select all" checked={rows.every(r=>r.keep)} onChange={e=>setRows(rs=>rs!.map(r=>({...r,keep:e.target.checked})))}/></th>{cols.map(([,l])=><th key={l}>{l}</th>)}<th>Status</th><th/></tr></thead><tbody>{rows.map((r,i)=>{const s=rowStatus(r);return <tr key={i} className={r.keep?'':'row-off'}><td><input type="checkbox" aria-label={'Include '+(r.name||'row '+(i+1))} checked={r.keep} onChange={e=>update(i,'keep',e.target.checked)}/></td>{cols.map(([k,l,ph])=><td key={k}>{k==='special_note'?<textarea rows={1} className="cell-input note" aria-label={l} placeholder={ph} value={r[k] as string} onChange={e=>update(i,k,e.target.value)}/>:<input className={`cell-input ${k}`} aria-label={l} placeholder={ph} value={r[k] as string} onChange={e=>update(i,k,e.target.value)}/>}</td>)}<td><span className={`intake-status ${s==='Ready'?'ok':'warn'}`}>{s==='Ready'?<CheckCircle2 size={12}/>:<AlertTriangle size={12}/>}{s}</span></td><td><button className="icon-button" aria-label="Remove row" onClick={()=>setRows(rs=>rs!.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></td></tr>;})}</tbody></table></div>
    <div className="intake-footer"><Field label="Assign all to"><select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{employees.filter(e=>e.status==='Active').map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></Field><button className="button primary" disabled={busy||!ready.length} onClick={()=>void importRows()}>{busy?'Adding…':`Add ${ready.length} lead${ready.length===1?'':'s'}`}</button></div>{error&&<div className="error">{error}</div>}</div>;

  const Icon=file?fileIcon(file.name):Upload;
  return <div className="intake">
    <div className="intake-grid">
      <div className={`upload-zone intake-drop ${drag?'dragging':''} ${file?'has-file':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>input.current?.click()} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')input.current?.click();}}>
        <Icon size={30}/>{file?<><h3>{file.name}</h3><p>{(file.size/1024).toFixed(0)} KB · ready to convert</p><button type="button" className="text-button" onClick={e=>{e.stopPropagation();setFile(null);if(input.current)input.current.value='';}}><X size={13}/>Remove</button></>:<><h3>Upload a file</h3><p>Excel (.xlsx/.xls), Sheet (.csv), PDF or TXT<br/>Drag & drop or click · up to 10 MB</p></>}
        <div className="intake-types"><span>XLSX</span><span>CSV</span><span>PDF</span><span>TXT</span></div>
        <input ref={input} hidden type="file" accept=".csv,.xlsx,.xls,.ods,.pdf,.txt" onChange={e=>pick(e.target.files?.[0])}/>
      </div>
      <div className="intake-notes"><div className="intake-notes-head"><StickyNote size={16}/><strong>Notes</strong><button type="button" className="text-button" onClick={()=>setText(sample)}>Show example</button></div><textarea value={text} onChange={e=>setText(e.target.value)} placeholder={'Paste or type leads in any format, e.g.\n\nRahul Sharma, 98765 43210, MG Road Pune, electronics shop, very rich\n\nName: Priya\nPhone: 98111 22233\nWork: Bakery\nNote: our friend'}/><p className="form-hint">One lead per line, or separate leads with a blank line. "Label: value" lines also work.</p></div>
    </div>
    <div className="intake-how"><Wand2 size={15}/><span>We find the <b>contact no</b>, <b>address</b>, <b>work</b> (their business), name, company & email, and put any extra details into the <b>special note</b>. You can check everything before saving.</span></div>
    {error&&<div className="error">{error}</div>}
    <div className="modal-footer"><a className="button small" href="/api/sales/template">Download Excel/CSV template</a><button className="button primary" disabled={busy||(!file&&!text.trim())} onClick={()=>void convert()}><Wand2 size={15}/>{busy?'Reading…':'Convert to leads'}</button></div>
  </div>;
}
