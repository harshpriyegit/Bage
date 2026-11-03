import list from '../shared/hybrid-themes.json';
/** Hybrid themes: a deep, dark sidebar paired with a light, tinted workspace and a vivid accent. */
export type HybridTheme={id:string;name:string;side:string;accent:string;accent2:string;glow:[string,string]};
export const HYBRID_THEMES=list as HybridTheme[];
export const hybridTheme=(id:string)=>HYBRID_THEMES.find(t=>t.id===id);
const VARS=['--accent','--accent-2','--accent-soft','--glow-1','--glow-2','--glow-3','--hy-side'];
export function applyHybrid(root:HTMLElement,id:string,mode:string){
  for(const k of VARS)root.style.removeProperty(k);
  const t=hybridTheme(id);
  if(!t){delete root.dataset.hybrid;return;}
  root.dataset.hybrid='';
  const accent=mode==='dark'?t.accent2:t.accent;
  root.style.setProperty('--accent',accent);
  root.style.setProperty('--accent-2',t.accent2);
  root.style.setProperty('--accent-soft',`color-mix(in srgb,${accent} 14%,transparent)`);
  root.style.setProperty('--hy-side',t.side);
  if(mode!=='dark'){root.style.setProperty('--glow-1',t.glow[0]);root.style.setProperty('--glow-2',t.glow[1]);root.style.setProperty('--glow-3',`color-mix(in srgb,${t.accent2} 30%,#fff)`);}
}
