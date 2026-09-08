import {Box3,BufferGeometry,CatmullRomCurve3,Color,Vector3} from 'three';
import type {Part} from '../anatomy';

export type TracerKind='blood'|'air'|'food'|'portal'|'mix';
export type TracerRoute={part:number;curve:CatmullRomCurve3;kind:TracerKind;outward:boolean;color:Color;length:number};
const heart=new Vector3(.022,1.32,.036),liver=new Vector3(-.065,1.16,.005);
const arteries=/^(ascending aorta|arch of aorta|descending thoracic aorta|abdominal aorta|pulmonary trunk|(?:left|right) (?:pulmonary|common carotid|internal carotid|vertebral|renal|common iliac|femoral|brachial|radial|subclavian) artery)$/i;
const veins=/^(superior vena cava|inferior vena cava|(?:left|right) (?:internal jugular|renal|common iliac|femoral|brachial|subclavian) vein|(?:left|right) (?:superior|inferior) pulmonary vein)$/i;
export function tracerKind(name:string):TracerKind|null {
 if(/^(hepatic portal vein|pre-hepatic portal vein|superior mesenteric vein|trunk of (left|right) portal vein)$/i.test(name))return 'portal';
 if(/^(trachea|left main bronchus|right main bronchus(?: proper)?)$/i.test(name))return 'air';
 if(/^esophagus$/i.test(name))return 'food';
 if(/^(stomach|duodenum)$/i.test(name))return 'mix';
 return arteries.test(name)||veins.test(name)?'blood':null;
}
/** Readability paths sampled from mesh cross sections, not validated vessel centerlines or junctions. */
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
 const outward=arteries.test(p.name),target=kind==='portal'?liver:heart;
 const startsFarther=points[0].distanceTo(target)>points.at(-1)!.distanceTo(target);
 if(kind==='blood'||kind==='portal'){
  if(startsFarther===(kind==='blood'&&outward))points.reverse();
 }else if(points[0].y<points.at(-1)!.y)points.reverse();
 const oxygenRich=outward!==/pulmonary/i.test(p.name);
 const color=kind==='air'?'#a9e7ed':kind==='blood'?(oxygenRich?'#ffac91':'#88bfff'):'#efcc78';
 const curve=new CatmullRomCurve3(points,false,'centripetal');
 return {part,curve,kind,outward,color:new Color(color),length:curve.getLength()};
}
