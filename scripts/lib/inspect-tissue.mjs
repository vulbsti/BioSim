import {Matrix4,Quaternion,Vector3} from 'three';
/** Independent byte inspection; no Blender receipt or renderer is trusted here. */
export function inspectTissueGLB(bytes){
 const fail=message=>{throw new Error(message);};
 if(bytes.length<28||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)fail('Invalid GLB header');
 let offset=12,json=null,bin=null;
 while(offset<bytes.length){const n=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(n%4||offset+8+n>bytes.length)fail('Invalid GLB chunk');const data=bytes.subarray(offset+8,offset+8+n);if(type===0x4e4f534a){if(json)fail('Duplicate JSON');json=JSON.parse(data.toString('utf8'));}else if(type===0x004e4942){if(bin)fail('Duplicate BIN');bin=data;}offset+=8+n;}
 if(!json||!bin||json.buffers?.length!==1||json.buffers[0].uri||json.buffers[0].byteLength>bin.length||bin.length-json.buffers[0].byteLength>3)fail('Invalid embedded buffer');
 if(json.extensionsRequired?.length||json.animations?.length||json.skins?.length)fail('Unadmitted GLB extension, animation or skin');
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sizes={5121:1,5123:2,5125:4,5126:4};
 const accessor=id=>{const a=json.accessors[id],v=json.bufferViews[a?.bufferView],width=widths[a?.type],size=sizes[a?.componentType];if(!a||a.sparse||a.normalized||!v||v.buffer!==0||!width||!size||!Number.isInteger(a.count)||a.count<1)fail('Unsupported accessor');const stride=v.byteStride??width*size,start=(v.byteOffset??0)+(a.byteOffset??0),end=start+(a.count-1)*stride+width*size;if(stride<width*size||start<0||end>bin.length||end>(v.byteOffset??0)+v.byteLength)fail('Accessor outside buffer');const read=a.componentType===5126?'readFloatLE':a.componentType===5125?'readUInt32LE':a.componentType===5123?'readUInt16LE':'readUInt8';const values=Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>bin[read](start+i*stride+j*size)));if(values.some(row=>row.some(x=>!Number.isFinite(x))))fail('Nonfinite attribute');return {values,accessor:a};};
 /** @type {Record<string,{min:number[],max:number[]}>} */
 const entityBoundsM={};
 const ids=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let triangles=0,vertices=0,primitives=0,minimumNormalLength=Infinity,maximumNormalLength=0;
 const visited=new Set();
 const visit=(index,parent,stack)=>{if(stack.has(index)||visited.has(index))fail('Cyclic or multiply parented node');const node=json.nodes[index];if(!node)fail('Missing node');visited.add(index);const local=new Matrix4();if(node.matrix)local.fromArray(node.matrix);else local.compose(new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1]));const world=parent.clone().multiply(local);if(world.elements.some(x=>!Number.isFinite(x))||Math.abs(world.determinant())<1e-20)fail('Invalid transform');
  if(node.mesh!==undefined){if(!node.extras?.entityId||node.extras.metersPerUnit!==1||!['source-surface','representative'].includes(node.extras.evidence))fail('Missing physical identity');ids.push(node.extras.entityId);const nodeBounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};entityBoundsM[node.extras.entityId]=nodeBounds;const mesh=json.meshes[node.mesh];if(!mesh)fail('Missing mesh');for(const p of mesh.primitives){if((p.mode??4)!==4)fail('Nontriangle mesh');const position=accessor(p.attributes.POSITION),normals=accessor(p.attributes.NORMAL),indices=accessor(p.indices);if(position.accessor.type!=='VEC3'||normals.accessor.type!=='VEC3'||normals.values.length!==position.values.length||indices.accessor.type!=='SCALAR'||indices.values.length%3)fail('Invalid mesh attributes');if(indices.values.some(([i])=>!Number.isInteger(i)||i<0||i>=position.values.length))fail('Index outside vertex buffer');
    for(const n of normals.values){const length=Math.hypot(...n);minimumNormalLength=Math.min(minimumNormalLength,length);maximumNormalLength=Math.max(maximumNormalLength,length);if(length<.95||length>1.05)fail('Nonunit normal');}
    for(const pos of position.values){const xyz=new Vector3().fromArray(pos).applyMatrix4(world).toArray();xyz.forEach((n,i)=>{bounds.min[i]=Math.min(bounds.min[i],n);bounds.max[i]=Math.max(bounds.max[i],n);nodeBounds.min[i]=Math.min(nodeBounds.min[i],n);nodeBounds.max[i]=Math.max(nodeBounds.max[i],n);});}
    const uv=p.attributes.TEXCOORD_0;if(uv!==undefined)accessor(uv);
    triangles+=indices.values.length/3;vertices+=position.values.length;primitives++;
  }}
  const next=new Set([...stack,index]);for(const child of node.children??[])visit(child,world,next);
 };
 for(const node of json.scenes[json.scene??0].nodes)visit(node,new Matrix4(),new Set());
 if(new Set(ids).size!==ids.length)fail('Duplicate entity ID');
 for(const image of json.images??[]){if(image.uri||!['image/png','image/jpeg'].includes(image.mimeType)||!json.bufferViews[image.bufferView])fail('Unembedded texture');const view=json.bufferViews[image.bufferView];if(view.buffer!==0||(view.byteOffset??0)+view.byteLength>bin.length)fail('Invalid image buffer');}
 return {bytes:bytes.length,triangles,vertices,primitives,entityIds:ids.sort(),boundsM:bounds,entityBoundsM,spanM:Math.max(...bounds.max.map((n,i)=>n-bounds.min[i])),minimumNormalLength,maximumNormalLength,embeddedImages:json.images?.length??0,generator:json.asset?.generator};
}
