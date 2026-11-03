import {useState,type DragEvent} from 'react';
import {CalendarDays, Paperclip, GripVertical, Plus} from 'lucide-react';
import {send,type Task} from './api';
import {Badge,STATUS_META,today,dateLabel} from './components';
const columns=['Assigned','Pending','Completed','Research'].map(status=>({status,icon:STATUS_META[status].icon,cls:STATUS_META[status].cls}));
export default function Board({tasks,onEdit,onRefresh,notify}:{tasks:Task[];onEdit:(id:number)=>void;onRefresh:()=>void;notify:(s:string)=>void}){
const [dragging,setDragging]=useState<number|null>(null),[over,setOver]=useState(''),[moved,setMoved]=useState<{id:number;status:string}|null>(null),[landed,setLanded]=useState<number|null>(null);
const statusOf=(t:Task)=>moved?.id===t.id?moved.status:t.status;
async function move(id:number,status:string){const task=tasks.find(t=>t.id===id);if(!task||task.status===status)return;setMoved({id,status});setLanded(id);try{await send(`/work/tasks/${id}/status`,{status},'PATCH');notify(status==='Completed'?'Moved to Completed. Nicely done!':`Moved to ${status}`);onRefresh();}catch(e){notify((e as Error).message);}finally{setTimeout(()=>{setMoved(null);setLanded(null);},450);}}
function drop(e:DragEvent,status:string){e.preventDefault();const id=Number(e.dataTransfer.getData('text/plain'));setOver('');setDragging(null);if(id)void move(id,status);}
const now=today();
return <div className="board">{columns.map(c=>{const items=tasks.filter(t=>statusOf(t)===c.status);return <section key={c.status} className={`board-column glass ${c.cls} ${over===c.status?'drop-target':''}`} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';if(over!==c.status)setOver(c.status);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOver('');}} onDrop={e=>drop(e,c.status)} aria-label={`${c.status} column`}>
<header className="board-column-head"><c.icon size={15}/><h3>{c.status}</h3><span className="count">{items.length}</span></header>
<div className="board-cards">{items.map(t=><article key={t.id} draggable className={`board-card glass-card ${STATUS_META[statusOf(t)]?.cls||''} ${dragging===t.id?'is-dragging':''} ${landed===t.id?'just-landed':''}`} onDragStart={e=>{e.dataTransfer.setData('text/plain',String(t.id));e.dataTransfer.effectAllowed='move';setDragging(t.id);}} onDragEnd={()=>{setDragging(null);setOver('');}}>
<div className="board-card-top"><GripVertical size={14} className="grip"/><button className={`task-link ${statusOf(t)==='Completed'?'struck':''}`} onClick={()=>onEdit(t.id)}>{t.title}</button></div>
<div className="board-card-meta"><Badge value={t.priority}/><span className={`date-label ${t.deadline<now&&statusOf(t)!=='Completed'?'overdue-text':''}`}><CalendarDays size={11}/>{dateLabel(t.deadline)}</span>{!!t.resource_count&&<span className="date-label"><Paperclip size={11}/>{t.resource_count}</span>}</div>
<select className="board-move" aria-label={`Move ${t.title}`} value={statusOf(t)} onChange={e=>void move(t.id,e.target.value)}>{columns.map(x=><option key={x.status}>{x.status}</option>)}</select>
</article>)}{!items.length&&<div className="board-empty"><Plus size={14}/>Drop work here</div>}</div></section>;})}</div>;
}
