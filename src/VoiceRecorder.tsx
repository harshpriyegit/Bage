import {useEffect,useRef,useState} from 'react';
import {Mic,Square,Loader2,X} from 'lucide-react';
import {api,send} from './api';

const RATE=16000, MAX_SECONDS=600;
const LANGS:[string,string][]=[['en','English'],['hi','Hindi'],['bn','Bengali'],['ta','Tamil'],['te','Telugu'],['mr','Marathi'],['gu','Gujarati'],['ur','Urdu']];

/** Decode a recorded clip and resample it to mono 16 kHz float32, the format Whisper expects. */
async function toPcm16k(blob:Blob):Promise<Float32Array>{
  const ctx=new AudioContext();
  try{
    const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
    const off=new OfflineAudioContext(1,Math.max(1,Math.ceil(decoded.duration*RATE)),RATE);
    const src=off.createBufferSource();src.buffer=decoded;src.connect(off.destination);src.start();
    return (await off.startRendering()).getChannelData(0);
  }finally{void ctx.close();}
}

type State='idle'|'recording'|'transcribing';
/** Mic button: records speech, transcribes it on our own server (Whisper, offline) and hands back the text. */
export default function VoiceRecorder({onText,compact=false}:{onText:(text:string)=>void;compact?:boolean}){
  const [state,setState]=useState<State>('idle'),[secs,setSecs]=useState(0),[level,setLevel]=useState(0),[error,setError]=useState(''),[lang,setLang]=useState(()=>localStorage.getItem('voice-lang')||'en');
  const rec=useRef<MediaRecorder|null>(null),chunks=useRef<Blob[]>([]),stream=useRef<MediaStream|null>(null),timer=useRef(0),raf=useRef(0),cancelled=useRef(false),audioCtx=useRef<AudioContext|null>(null);
  const cleanup=()=>{clearInterval(timer.current);cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;void audioCtx.current?.close();audioCtx.current=null;setLevel(0);};
  useEffect(()=>()=>{cancelled.current=true;rec.current?.state==='recording'&&rec.current.stop();cleanup();},[]);
  useEffect(()=>{if(state==='recording'&&secs>=MAX_SECONDS)stop();},[secs,state]);

  async function start(){
    setError('');
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('This browser cannot record audio.');return;}
    try{
      void send('/voice/warmup',{}).catch(()=>{});
      const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
      stream.current=s;chunks.current=[];cancelled.current=false;
      const r=new MediaRecorder(s);rec.current=r;
      r.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
      r.onstop=()=>{cleanup();if(cancelled.current){setState('idle');return;}void finish(new Blob(chunks.current,{type:r.mimeType}));};
      r.start(1000);setSecs(0);setState('recording');
      timer.current=window.setInterval(()=>setSecs(x=>x+1),1000);
      // live input meter so the user can see the mic is hearing them
      const ctx=new AudioContext();audioCtx.current=ctx;const an=ctx.createAnalyser();an.fftSize=512;ctx.createMediaStreamSource(s).connect(an);const buf=new Uint8Array(an.fftSize);
      const tick=()=>{an.getByteTimeDomainData(buf);let sum=0;for(const v of buf){const d=(v-128)/128;sum+=d*d;}setLevel(Math.min(1,Math.sqrt(sum/buf.length)*4));raf.current=requestAnimationFrame(tick);};tick();
    }catch(e){cleanup();setState('idle');const n=(e as DOMException).name;setError(n==='NotAllowedError'?'Microphone permission was blocked. Allow it from the address bar and try again.':n==='NotFoundError'?'No microphone found.':'Could not start recording.');}
  }
  function stop(){if(rec.current?.state==='recording'){setState('transcribing');rec.current.stop();}}
  function cancel(){cancelled.current=true;if(rec.current?.state==='recording')rec.current.stop();else{cleanup();setState('idle');}}

  async function finish(blob:Blob){
    setState('transcribing');
    try{
      const pcm=await toPcm16k(blob);
      if(pcm.length<RATE*0.5){setError('That recording was too short.');return;}
      const r=await api('/voice/transcribe'+(lang?`?lang=${lang}`:''),{method:'POST',body:pcm.buffer as ArrayBuffer,headers:{'Content-Type':'application/octet-stream'}});
      if(r.text)onText(r.text);else setError('No speech was heard. Try speaking closer to the mic.');
    }catch(e){setError((e as Error).message);}finally{setState('idle');}
  }
  const mmss=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
  return <div className={`voice ${compact?'compact':''}`}>
    {state==='idle'&&<><button type="button" className="button voice-btn" onClick={()=>void start()} title="Record a voice note — converted to text on this server"><Mic size={15}/>{!compact&&'Voice note'}</button>{!compact&&<select className="voice-lang" value={lang} aria-label="Spoken language" onChange={e=>{setLang(e.target.value);localStorage.setItem('voice-lang',e.target.value);}}>{LANGS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}</>}
    {state==='recording'&&<div className="voice-live" role="status"><span className="voice-dot"/><span className="voice-meter" aria-hidden="true">{[0.5,0.8,1,0.8,0.5].map((m,i)=><i key={i} style={{transform:`scaleY(${0.15+level*m})`}}/>)}</span><span className="voice-time">{mmss}</span><button type="button" className="button small primary" onClick={stop}><Square size={12}/>Stop</button><button type="button" className="icon-button small" aria-label="Discard recording" onClick={cancel}><X size={14}/></button></div>}
    {state==='transcribing'&&<span className="voice-busy" role="status"><Loader2 size={14} className="spin"/>Converting speech to text…</span>}
    {error&&<span className="voice-error" role="alert">{error}</span>}
  </div>;
}
