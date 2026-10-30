/**
 * Ambient occlusion baked per vertex from the brain's own shape: how much of the sky each point can see.
 * The folds of the cortex are separate meshes in the atlas, so the grooves between them are gaps, not creases;
 * occlusion is what makes those gaps read as deep sulci instead of seams between rubber pieces.
 * Every surface is splatted into a voxel grid once, then each vertex marches a fixed fan of rays through it.
 * About 120k vertices in a few hundred milliseconds; it runs once when the brain loads.
 */
export interface Surface {positions:Float32Array;normals:ArrayLike<number>;normalScale:number;index:ArrayLike<number>}
const STEPS=[1.6,2.8,4.2,6,8.5,12];
/** A fixed, evenly spread set of directions (Fibonacci sphere), so the result does not flicker between loads. */
function directions(n:number){const out:number[][]=[],g=Math.PI*(3-Math.sqrt(5));for(let i=0;i<n;i++){const y=1-(i+.5)/n*2,r=Math.sqrt(1-y*y);out.push([Math.cos(g*i)*r,y,Math.sin(g*i)*r]);}return out;}
/** Returns one value per vertex of each target: 1 in the open, toward 0 deep in a groove. `cell` is the voxel size in metres. */
export function bakeOcclusion(occluders:Surface[],targets:Surface[],cell=.0011,rays=40):Float32Array[] {
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const s of occluders)for(let i=0;i<s.positions.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],s.positions[i+k]);hi[k]=Math.max(hi[k],s.positions[i+k]);}
 const pad=STEPS[STEPS.length-1]*cell+cell;for(let k=0;k<3;k++){lo[k]-=pad;hi[k]+=pad;}
 const n=[0,1,2].map(k=>Math.ceil((hi[k]-lo[k])/cell)),grid=new Uint8Array(n[0]*n[1]*n[2]);
 const at=(x:number,y:number,z:number)=>{const i=Math.floor((x-lo[0])/cell),j=Math.floor((y-lo[1])/cell),k=Math.floor((z-lo[2])/cell);return i<0||j<0||k<0||i>=n[0]||j>=n[1]||k>=n[2]?-1:(k*n[1]+j)*n[0]+i;};
 // Splat every triangle densely enough that no voxel it crosses is skipped.
 for(const s of occluders){const p=s.positions,ix=s.index;
  for(let t=0;t<ix.length;t+=3){const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;
   const e=Math.max(Math.hypot(p[a]-p[b],p[a+1]-p[b+1],p[a+2]-p[b+2]),Math.hypot(p[a]-p[c],p[a+1]-p[c+1],p[a+2]-p[c+2]),Math.hypot(p[b]-p[c],p[b+1]-p[c+1],p[b+2]-p[c+2]));
   const m=Math.max(1,Math.ceil(e/cell*1.5));
   for(let u=0;u<=m;u++)for(let v=0;v<=m-u;v++){const w=m-u-v,f=1/m;const id=at((p[a]*u+p[b]*v+p[c]*w)*f,(p[a+1]*u+p[b+1]*v+p[c+1]*w)*f,(p[a+2]*u+p[b+2]*v+p[c+2]*w)*f);if(id>=0)grid[id]=1;}
  }}
 const dirs=directions(rays);
 return targets.map(s=>{const p=s.positions,nm=s.normals,out=new Float32Array(p.length/3);
  for(let v=0;v<out.length;v++){
   let nx=nm[v*3]*s.normalScale,ny=nm[v*3+1]*s.normalScale,nz=nm[v*3+2]*s.normalScale;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
   // Start just off the surface so a grazing ray does not hit the voxels of its own triangle.
   const x=p[v*3]+nx*cell*1.5,y=p[v*3+1]+ny*cell*1.5,z=p[v*3+2]+nz*cell*1.5;
   let open=0,total=0;
   for(const d of dirs){const cos=d[0]*nx+d[1]*ny+d[2]*nz;if(cos<=.05)continue;total+=cos;let seen=1;
    for(let k=0;k<STEPS.length;k++){const r=STEPS[k]*cell,id=at(x+d[0]*r,y+d[1]*r,z+d[2]*r);if(id>=0&&grid[id]){seen=k/STEPS.length*.5;break;}}
    open+=cos*seen;}
   out[v]=total?open/total:1;}
  return out;});
}
