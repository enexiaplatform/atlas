import {BookOpen,FlaskConical,Globe2,Layers3,Compass} from 'lucide-react';
export function Mark(){return <svg width="36" height="36" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M3 32 18 5h5L9 32zm11 0 9-17 12 17h-7l-5-8-4 8z" fill="currentColor"/></svg>}
export function Topography(){return <svg className="terrain" aria-hidden="true" viewBox="0 0 680 220" preserveAspectRatio="xMidYMid slice"><defs><pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#82ab87"/></pattern></defs><rect width="680" height="220" fill="url(#grid)" opacity=".42"/>{Array.from({length:54},(_,i)=>{
 const p=Array.from({length:151},(_,j)=>{const x=j*4.9-25;const y=35+i*3.25+26*Math.sin(x/89+i*.045)+18*Math.cos(x/47-i*.032)-65*Math.exp(-Math.pow((x-451-i*.7)/82,2))+21*Math.sin(x/117+i*.052);return (j?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)}).join(' ');return <path key={i} d={p} stroke={i%5===0?'#b1c89a':'#7b9a72'} strokeWidth={i%5===0?1.4:.7} opacity=".72" fill="none"/>})}</svg>}
export const domainIcons=[FlaskConical,Globe2,Layers3,Compass];
export const domainColor=(d:string)=>d.includes('Scientific')?'sage':d.includes('Market')?'blue':d.includes('Competitive')?'ochre':'lilac';
export function AssetIcon({domain}:{domain:string}){const c=domainColor(domain);const Icon=({sage:FlaskConical,blue:Globe2,ochre:Layers3,lilac:Compass})[c]||BookOpen;return <span className={'asset-icon '+c}><Icon size={17}/></span>}

