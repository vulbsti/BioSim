import type {BodyState,Organ} from '../simulation/types';

export type Circuit='arterial'|'venous'|'pulmonary-arterial'|'pulmonary-venous'|'portal';
export type Bed='heart'|'brain'|'kidneys'|'gut'|'liver'|'hepatic'|'peripheral'|'lungs';
export type Junction='source'|'contact'|'inferred'|'detached';
export interface VesselGraph {version:string;segments:{part:string;circuit:Circuit;away:boolean;parent:number|null;junction:Junction;radiusMm:number;points:number[];share:Partial<Record<Bed,number>>}[]}
/** `bead` is the displayed bead diameter, m: a little under the lumen, within readable limits. `level` is the carried substance level set by setLevels. */
export interface FlowSegment {part:number;circuit:Circuit;away:boolean;parent:number;points:Float32Array;along:Float32Array;length:number;area:number;share:[Bed,number][];radius:number;bead:number;level:number;flow:number;speed:number;transit:number;clock:number}

/** Seconds between beads released at a root. */
export const BEAD_INTERVAL=.12;
/** Beads closer than this along a vessel are thinned by powers of two, m. */
export const MIN_SPACING=.01;
/** Display floor so the slowest end branches still visibly move, m/s. Reported speeds are not floored. */
export const MIN_DISPLAY_SPEED=.004;

/** Whole-blood flow through each simulated bed, m³/s, from the body state's organ flows (L/min). */
export function bedFlows(s:BodyState):Record<Bed,number>{
 const q=(...ids:Organ[])=>ids.reduce((a,id)=>a+(s.flows.find(f=>f.id===id)?.flow??0),0)/60000;
 return {heart:q('heart'),brain:q('brain'),kidneys:q('kidneys'),gut:q('gut'),liver:q('liver'),hepatic:q('liver','gut'),peripheral:q('muscle','skin','adipose','endocrine'),lungs:s.cardiacOutput/60000};
}

/**
 * Beads ride the extracted centerlines. A bead released at a root at time t0 sits wherever the
 * transit time from that root equals t - t0, on every branch at once, so beads stay continuous
 * through junctions. Speed in each segment is its simulated flow divided by its lumen area.
 */
export function createVesselFlow(graph:VesselGraph,partIndex:Map<string,number>){
 const segments:FlowSegment[]=graph.segments.map(s=>{
  const n=s.points.length/3,points=new Float32Array(s.points.length),along=new Float32Array(n);
  for(let i=0;i<s.points.length;i++)points[i]=s.points[i]/10000;
  for(let i=1;i<n;i++)along[i]=along[i-1]+Math.hypot(points[i*3]-points[i*3-3],points[i*3+1]-points[i*3-2],points[i*3+2]-points[i*3-1]);
  const radius=s.radiusMm/1000;
  return {part:partIndex.get(s.part)??-1,circuit:s.circuit,away:s.away,parent:s.parent??-1,points,along,length:along[n-1],area:Math.PI*radius*radius,share:Object.entries(s.share) as [Bed,number][],radius,bead:Math.min(.008,Math.max(.0012,radius*1.3)),level:1,flow:0,speed:0,transit:0,clock:NaN};
 });
 const pulsed=(s:FlowSegment)=>s.circuit==='arterial'||s.circuit==='pulmonary-arterial';
 /** Segment flows (m³/s) and speeds (m/s) for the current bed flows. Parents precede children. */
 let current:Record<Bed,number>|null=null;
 const setFlows=(beds:Record<Bed,number>)=>{
  current=beds;
  for(const s of segments){
   s.flow=0;for(const [bed,share] of s.share)s.flow+=beds[bed]*share;
   s.speed=s.flow/s.area;
   const up=s.parent>=0?segments[s.parent]:null;
   // Transit time between the root and this segment's root-side end, at displayed speeds.
   s.transit=up&&up.away===s.away?up.transit+up.length/Math.max(MIN_DISPLAY_SPEED,up.speed):0;
  }
 };
 /**
  * Substance level carried in each segment. Arteries carry arterial blood everywhere. A vein
  * carries the blood of the beds it drains, mixed in proportion to their flows, so a merged vein
  * shows the blend of its tributaries. Portal tributaries carry gut blood; the trunk and its
  * hepatic branches carry the portal compartment.
  */
 const setLevels=(l:{bed:Record<Bed,number>;arterial:number;venous:number;lungs:number;portal:number;gut:number})=>{
  for(const s of segments){
   if(s.circuit==='arterial')s.level=l.arterial;
   else if(s.circuit==='pulmonary-arterial')s.level=l.venous;
   else if(s.circuit==='pulmonary-venous')s.level=l.lungs;
   else if(s.circuit==='portal')s.level=s.away||(s.share.find(([bed])=>bed==='gut')?.[1]??0)>=.5?l.portal:l.gut;
   else{let mixed=0;if(current)for(const [bed,share] of s.share)mixed+=current[bed]*share*l.bed[bed];s.level=s.flow>0?mixed/s.flow:l.venous;}
  }
 };
 let pulsedTime=0,steadyTime=0;
 /** Advance bead clocks. Arterial time is stretched by the cardiac pulse; venous time is steady. */
 const advance=(dtPulsed:number,dtSteady:number)=>{
  pulsedTime+=dtPulsed;steadyTime+=dtSteady;
  for(const s of segments){
   const dt=pulsed(s)?dtPulsed:dtSteady,time=pulsed(s)?pulsedTime:steadyTime;
   // Outward beads lag the root by the transit time; returning beads lead it.
   const target=s.away?time-s.transit:time+s.transit;
   if(Number.isNaN(s.clock)){s.clock=target;continue;}
   // When flows change, drift back into step with the junction instead of jumping.
   let error=(target-s.clock)%BEAD_INTERVAL;if(error>BEAD_INTERVAL/2)error-=BEAD_INTERVAL;if(error<-BEAD_INTERVAL/2)error+=BEAD_INTERVAL;
   s.clock+=dt+Math.max(-.3*dt,Math.min(.3*dt,error));
  }
 };
 /** Visit every bead of the segments accepted by `visible`. Returns the number emitted. */
 const beads=(visible:(s:FlowSegment)=>boolean,emit:(x:number,y:number,z:number,s:FlowSegment)=>void,limit=Infinity)=>{
  let count=0;
  for(const s of segments){
   if(s.length<=0||s.flow<=0||!visible(s))continue;
   const shown=Math.max(MIN_DISPLAY_SPEED,s.speed),spacing=shown*BEAD_INTERVAL,stride=2**Math.max(0,Math.ceil(Math.log2(MIN_SPACING/spacing)));
   // Distance from the root-side end of the first bead, and that bead's running number.
   const turns=(s.away?s.clock:-s.clock)/BEAD_INTERVAL,first=Math.floor(turns),offset=(turns-first)*spacing;
   let at=1;
   for(let j=0,d=offset;d<s.length&&count<limit;j++,d+=spacing){
    const number=j-first;if(((number%stride)+stride)%stride)continue;
    while(at<s.along.length-1&&s.along[at]<d)at++;
    const a=s.along[at-1],t=(d-a)/Math.max(1e-9,s.along[at]-a),i=at*3,p=s.points;
    emit(p[i-3]+(p[i]-p[i-3])*t,p[i-2]+(p[i+1]-p[i-2])*t,p[i-1]+(p[i+2]-p[i-1])*t,s);count++;
   }
  }
  return count;
 };
 return {segments,setFlows,setLevels,advance,beads};
}
export type VesselFlow=ReturnType<typeof createVesselFlow>;
