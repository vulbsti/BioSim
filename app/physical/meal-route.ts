import type {BodyState} from '../simulation/types';
import type {VesselGraph} from './vessel-flow';

/**
 * One path a meal's glucose can take from the stomach to a thigh muscle, along the extracted
 * vessel centerlines: gut vein, portal vein, liver, hepatic vein, vena cava, right heart, lungs,
 * left heart, aorta, leg arteries, and the artery that supplies the vastus lateralis.
 *
 * It is one route among many. The body model is compartments, so the amounts shown at each
 * station are the compartment's, not this vessel's alone.
 */
export const ROUTE_STATIONS=[
 {id:'stomach',name:'Stomach',pools:['stomach']},
 {id:'intestine',name:'Small intestine',pools:['intestinal lumen']},
 {id:'portal',name:'Portal vein',pools:['gut-blood','portal']},
 {id:'liver',name:'Liver',pools:['liver-blood','liver-tissue','hepatic glycogen']},
 {id:'veins',name:'Vena cava',pools:['venous']},
 {id:'lungs',name:'Lungs',pools:['lungs-blood']},
 {id:'arteries',name:'Aorta',pools:['arterial']},
 {id:'muscle',name:'Muscle',pools:['muscle-blood','muscle-tissue','muscle-cell','muscle-cell-r0','muscle-cell-r1','muscle-cell-r2','muscle-cell-r3']},
] as const;
export type RouteStation=(typeof ROUTE_STATIONS)[number]['id'];
/** A stretch of the route: along vessel centerlines, or straight through an organ the graph does not cross. */
export type RouteLeg={station:RouteStation;kind:'vessel'|'through';points:number[]};
export interface MealRoute {legs:RouteLeg[];stations:{id:RouteStation;name:string;at:[number,number,number]}[];segments:number[];lengthM:number;vessels:string[]}

type Point=[number,number,number];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
/**
 * Builds the route. `nameOf` gives a mesh's name, and `centreOf` the centre of the named meshes
 * (metres). Throws when a vessel the route needs is missing from the graph.
 */
export function buildMealRoute(graph:VesselGraph,nameOf:(part:string)=>string|undefined,centreOf:(pattern:RegExp)=>Point):MealRoute{
 const segments=graph.segments,points=(i:number,reversed:boolean)=>{const p=segments[i].points,out:Point[]=[];for(let k=0;k<p.length;k+=3)out.push([p[k]/10000,p[k+1]/10000,p[k+2]/10000]);return reversed?out.reverse():out;};
 const toRoot=(i:number)=>{const chain=[i];while(segments[chain.at(-1)!].parent!==null)chain.push(segments[chain.at(-1)!].parent!);return chain;};
 const end=(i:number)=>points(i,false).at(-1)!;
 /** The segment of a named vessel farthest from its circuit's root, or the one whose far end is nearest `near`. */
 const pick=(pattern:RegExp,circuit:string,near?:Point)=>{
  let best=-1,score=-Infinity;
  segments.forEach((s,i)=>{if(s.circuit!==circuit||!pattern.test(nameOf(s.part)??''))return;const value=near?-distance(end(i),near):toRoot(i).length;if(value>score){score=value;best=i;}});
  if(best<0)throw new Error(`The vessel graph has no ${circuit} segment named ${pattern}.`);
  return best;
 };
 /** Centerline points of a chain in the direction blood flows, and the segments used. */
 const along=(leaf:number,outward:boolean)=>{const chain=toRoot(leaf);if(outward)chain.reverse();return {chain,line:chain.flatMap(i=>points(i,!outward))};};
 const stomach=centreOf(/^stomach$/i),duodenum=centreOf(/^duodenum$/i),liver=centreOf(/^(liver|.* lobe of liver)$/i),heart=centreOf(/^wall of ventricle$/i),muscle=centreOf(/^left vastus lateralis$/i);
 const gut=along(pick(/^superior mesenteric vein$/i,'portal',duodenum),false);
 const hepatic=along(pick(/^right hepatic vein$/i,'venous'),false);
 const toLungs=along(pick(/left/i,'pulmonary-arterial'),true);
 const fromLungs=along(pick(/left/i,'pulmonary-venous',toLungs.line.at(-1)!),false);
 const toLeg=along(pick(/^descending branch of left lateral circumflex femoral artery$/i,'arterial',muscle),true);
 const flat=(line:Point[])=>line.flat(),through=(station:RouteStation,...line:Point[]):RouteLeg=>({station,kind:'through',points:flat(line)}),vessel=(station:RouteStation,line:Point[]):RouteLeg=>({station,kind:'vessel',points:flat(line)});
 const legs:RouteLeg[]=[
  through('stomach',stomach,duodenum),through('intestine',duodenum,gut.line[0]),
  vessel('portal',gut.line),through('liver',gut.line.at(-1)!,liver,hepatic.line[0]),
  vessel('veins',hepatic.line),through('veins',hepatic.line.at(-1)!,heart,toLungs.line[0]),
  vessel('lungs',toLungs.line),through('lungs',toLungs.line.at(-1)!,fromLungs.line[0]),vessel('lungs',fromLungs.line),
  through('arteries',fromLungs.line.at(-1)!,heart,toLeg.line[0]),vessel('arteries',toLeg.line),
  through('muscle',toLeg.line.at(-1)!,muscle),
 ];
 let lengthM=0;for(const leg of legs)for(let k=3;k<leg.points.length;k+=3)lengthM+=Math.hypot(leg.points[k]-leg.points[k-3],leg.points[k+1]-leg.points[k-2],leg.points[k+2]-leg.points[k-1]);
 const used=[...gut.chain,...hepatic.chain,...toLungs.chain,...fromLungs.chain,...toLeg.chain];
 const at:Record<RouteStation,Point>={stomach,intestine:duodenum,portal:gut.line[Math.floor(gut.line.length*.75)],liver,veins:hepatic.line.at(-1)!,lungs:toLungs.line.at(-1)!,arteries:toLeg.line[Math.floor(toLeg.line.length*.25)],muscle};
 return {legs,stations:ROUTE_STATIONS.map(s=>({id:s.id,name:s.name,at:at[s.id]})),segments:used,lengthM,vessels:[...new Set(used.map(i=>nameOf(segments[i].part)??'?'))]};
}
/** Grams of the marked meal's carbohydrate at each station now. */
export function routeAmounts(s:BodyState){
 const pools=s.transport.mark.pools;
 return Object.fromEntries(ROUTE_STATIONS.map(station=>[station.id,station.pools.reduce((a,id)=>a+(pools[id]?.glucose??0),0)])) as Record<RouteStation,number>;
}
