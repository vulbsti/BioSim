/**
 * Where things are in blood, at any scale. Every species is laid on its own jittered lattice with
 * exactly one member per lattice cell, so its number density is exact and any view of it can be
 * generated on demand without storing positions. Lengths are metres in double precision; callers
 * divide by the view's width before handing positions to the GPU.
 */
/** `stagger` slides each z layer sideways by its own amount, so stacked layers do not line up. */
export type Lattice={gx:number;gy:number;gz:number;jitter:number;salt:number;stagger?:boolean};
export type Point={x:number;y:number;z:number;seed:number};

/** A stable number in [0, 1) for a lattice cell. */
export function hash(i:number,j:number,k:number,salt:number):number {
 let h=(Math.imul(i|0,0x9e3779b1)^Math.imul(j|0,0x85ebca6b)^Math.imul(k|0,0xc2b2ae35)^Math.imul(salt+1|0,0x27d4eb2f))>>>0;
 h^=h>>>16;h=Math.imul(h,0x7feb352d)>>>0;h^=h>>>15;h=Math.imul(h,0x846ca68b)>>>0;h^=h>>>16;
 return (h>>>0)/4294967296;
}
/** A cubic lattice holding `density` members per cubic metre, each placed anywhere in its cell. */
export const cubic=(density:number,salt:number):Lattice=>{const g=Math.cbrt(1/density);return {gx:g,gy:g,gz:g,jitter:1,salt};};
/** The member of cell (i, j, k). */
export function member(l:Lattice,i:number,j:number,k:number,out:Point):Point {
 out.seed=hash(i,j,k,l.salt);
 out.x=(i+.5+l.jitter*(hash(i,j,k,l.salt+101)-.5)+(l.stagger?hash(0,0,k,l.salt+404):0))*l.gx;out.y=(j+.5+l.jitter*(hash(i,j,k,l.salt+202)-.5)+(l.stagger?hash(0,0,k,l.salt+505):0))*l.gy;out.z=(k+.5+l.jitter*(hash(i,j,k,l.salt+303)-.5))*l.gz;
 return out;
}
/**
 * Visit every member within the box centre ± half. Returns false without visiting anything if the
 * box holds more than `limit` cells, so a caller can shrink the box instead of drawing a sample.
 */
export function visit(l:Lattice,cx:number,cy:number,cz:number,hx:number,hy:number,hz:number,limit:number,emit:(p:Point,i:number,j:number,k:number)=>void):boolean {
 // A member can sit up to half a jittered cell from its cell centre.
 const pad=l.stagger?1.5:.5,i0=Math.floor((cx-hx)/l.gx-pad),i1=Math.floor((cx+hx)/l.gx+.5),j0=Math.floor((cy-hy)/l.gy-pad),j1=Math.floor((cy+hy)/l.gy+.5),k0=Math.floor((cz-hz)/l.gz-.5),k1=Math.floor((cz+hz)/l.gz+.5);
 if((i1-i0+1)*(j1-j0+1)*(k1-k0+1)>limit)return false;
 const p:Point={x:0,y:0,z:0,seed:0};
 for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)for(let k=k0;k<=k1;k++){
  member(l,i,j,k,p);if(Math.abs(p.x-cx)<=hx&&Math.abs(p.y-cy)<=hy&&Math.abs(p.z-cz)<=hz)emit(p,i,j,k);
 }
 return true;
}
/** How many lattice cells `visit` would walk for a box: an upper bound on the members in it. */
export function cells(l:Lattice,hx:number,hy:number,hz:number):number {const pad=l.stagger?2.5:1.5;return (2*hx/l.gx+pad)*(2*hy/l.gy+pad)*(2*hz/l.gz+1.5);}
/** The member nearest a point, searching the cells around it. */
export function nearest(l:Lattice,x:number,y:number,z:number):Point&{distance:number}{
 const ci=Math.floor(x/l.gx),cj=Math.floor(y/l.gy),ck=Math.floor(z/l.gz),p:Point={x:0,y:0,z:0,seed:0},best={x:0,y:0,z:0,seed:0,distance:Infinity};
 for(let i=ci-2;i<=ci+2;i++)for(let j=cj-2;j<=cj+2;j++)for(let k=ck-2;k<=ck+2;k++){
  member(l,i,j,k,p);const d=Math.hypot(p.x-x,p.y-y,p.z-z);if(d<best.distance)Object.assign(best,p,{distance:d});
 }
 return best;
}
/** Mean distance from a random point to the nearest member of a species at `density` per cubic metre. */
export const meanNearest=(density:number)=>.554*Math.cbrt(1/density);

/** A length as people write it: 7.8 µm, 0.7 nm, 2.5 mm. */
export function length(metres:number):string {
 const [unit,scale]=metres>=.01?['cm',100]:metres>=1e-3?['mm',1e3]:metres>=1e-6?['µm',1e6]:['nm',1e9] as [string,number],v=metres*(scale as number);
 return `${v>=100?v.toFixed(0):v>=10?v.toFixed(1).replace(/\.0$/,''):v.toFixed(v<1?2:1).replace(/\.0+$/,'')} ${unit}`;
}
/** A molar concentration as people write it: 5.0 mM, 60 pM. */
export function molar(molPerL:number):string {
 const [unit,scale]=molPerL>=1e-3?['mM',1e3]:molPerL>=1e-6?['µM',1e6]:molPerL>=1e-9?['nM',1e9]:molPerL>=1e-12?['pM',1e12]:['fM',1e15] as [string,number],v=molPerL*(scale as number);
 return `${v>=100?v.toFixed(0):v>=10?v.toFixed(1):v.toFixed(2)} ${unit}`;
}
/** The largest of 1, 2, 5 × 10^n not above `metres`: the length of a scale bar. */
export function niceLength(metres:number):number {const base=10**Math.floor(Math.log10(metres)),m=metres/base;return (m>=5?5:m>=2?2:1)*base;}
