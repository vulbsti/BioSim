import {Box3,BufferGeometry,CatmullRomCurve3,Color,Vector3} from 'three';
import type {Part} from '../anatomy';

export type TracerKind='air'|'food'|'mix';
export type TracerRoute={part:number;curve:CatmullRomCurve3;kind:TracerKind;color:Color;length:number};
/** Airway and gut lumen illustrations. Blood follows the extracted vessel graph (vessel-flow.ts). */
export function tracerKind(name:string):TracerKind|null {
 if(/^(trachea|left main bronchus|right main bronchus(?: proper)?)$/i.test(name))return 'air';
 if(/^esophagus$/i.test(name))return 'food';
 return /^(stomach|duodenum)$/i.test(name)?'mix':null;
}
/** Readability paths sampled from mesh cross sections, not validated lumen centerlines. */
export function createTracerRoute(p:Part,part:number,g:BufferGeometry):TracerRoute|null {
 const kind=tracerKind(p.name);if(!kind)return null;
 const box=new Box3(new Vector3().fromArray(p.bounds[0]),new Vector3().fromArray(p.bounds[1]));
 const extent=box.getSize(new Vector3()),axis=extent.y>=extent.x&&extent.y>=extent.z?1:extent.x>=extent.z?0:2;
 const position=g.getAttribute('position'),bins=Array.from({length:24},()=>({sum:new Vector3(),n:0})),point=new Vector3();
 for(let v=0;v<position.count;v++){
  point.set(position.getX(v),position.getY(v),position.getZ(v));
  // Quantized Float32 vertices can lie just outside the double precision manifest bounds.
  const b=Math.max(0,Math.min(23,Math.floor((point.getComponent(axis)-box.min.getComponent(axis))/Math.max(.00001,extent.getComponent(axis))*24)));
  bins[b].sum.add(point);bins[b].n++;
 }
 let points=bins.filter(b=>b.n).map(b=>b.sum.multiplyScalar(1/b.n));if(points.length<2)return null;
 if(points[0].y<points.at(-1)!.y)points.reverse();
 const color=kind==='air'?'#a9e7ed':'#efcc78';
 const curve=new CatmullRomCurve3(points,false,'centripetal');
 return {part,curve,kind,color:new Color(color),length:curve.getLength()};
}
