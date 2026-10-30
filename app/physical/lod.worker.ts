/// <reference lib="webworker" />
import {MeshoptSimplifier} from 'meshoptimizer/simplifier';
/** Lighter index lists for each part, in metres of surface error. They reuse the part's own vertices, so normals and colours stay the source's.
 * Open edges are locked, so neighbouring meshes never gap. The scene picks one only while its error stays under half a pixel on screen. */
export const LOD_ERRORS=[.0005,.0015,.004];
export interface LodRequest {chunk:number;buffer:ArrayBuffer;parts:{part:number;positions:number;vertexCount:number;indices:number;indexCount:number}[]}
export interface LodReply {chunk:number;parts:{part:number;levels:{error:number;indices:Uint32Array}[]}[]}
self.onmessage=async(e:MessageEvent<LodRequest>)=>{
 await MeshoptSimplifier.ready;
 const {chunk,buffer,parts}=e.data,reply:LodReply={chunk,parts:[]},transfer:ArrayBuffer[]=[];
 for(const p of parts){
  const positions=new Float32Array(buffer,p.positions,p.vertexCount*3),indices=new Uint32Array(buffer,p.indices,p.indexCount),levels:LodReply['parts'][number]['levels']=[];
  let previous=p.indexCount;
  for(const target of LOD_ERRORS){
   const [simplified]=MeshoptSimplifier.simplify(indices,positions,3,0,target,['LockBorder','ErrorAbsolute']);
   // A level only earns its place if it drops at least a fifth of the triangles of the one before.
   if(simplified.length>previous*.8)continue;
   levels.push({error:target,indices:simplified});transfer.push(simplified.buffer as ArrayBuffer);previous=simplified.length;
  }
  if(levels.length)reply.parts.push({part:p.part,levels});
 }
 self.postMessage(reply,transfer);
};
