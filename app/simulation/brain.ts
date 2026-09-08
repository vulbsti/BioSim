import type {Atlas} from '../anatomy';
import type {BodyState} from './types';

export type BrainNode={id:string;name:string;x:number;y:number;kind:'artery'|'territory'|'vein'|'source';description:string;match:string[]};
export type BrainEdge={id:string;from:string;to:string;resistance:number;kind:'artery'|'bed'|'vein';name:string};
export const brainNodes:BrainNode[]=[
  {id:'aorta',name:'Aortic supply',x:350,y:640,kind:'source',description:'Systemic arterial pressure supplies paired carotid and vertebral arteries.',match:['aorta']},
  {id:'basilar',name:'Basilar',x:350,y:460,kind:'artery',description:'Paired vertebral arteries merge into the basilar artery; supplies posterior circulation.',match:['basilar artery']},
  {id:'acom',name:'ACom',x:350,y:240,kind:'artery',description:'Anterior communicating connection between the two anterior cerebral arteries.',match:['anterior communicating artery']},
  {id:'sagittal',name:'Superior sagittal sinus',x:350,y:70,kind:'vein',description:'Schematic collector for superficial cortical venous drainage.',match:['superior sagittal sinus']},
  {id:'deepvein',name:'Deep cerebral veins',x:350,y:150,kind:'vein',description:'Deep tissue drainage through internal cerebral veins and the great cerebral vein.',match:['internal cerebral vein','great cerebral vein']},
  {id:'straight',name:'Straight sinus',x:555,y:160,kind:'vein',description:'Receives deep drainage; continues to the confluence and transverse sinuses.',match:['straight sinus']},
  {id:'confluence',name:'Confluence',x:615,y:70,kind:'vein',description:'Simplified confluence of superficial and deep venous routes.',match:['confluence of sinuses']},
  {id:'vena',name:'Central venous return',x:650,y:640,kind:'source',description:'Return through internal jugular veins to the central venous circulation.',match:['superior vena cava']},
];
export const brainEdges:BrainEdge[]=[];
function edge(from:string,to:string,resistance:number,kind:BrainEdge['kind'],name:string){brainEdges.push({id:`${from}-${to}`,from,to,resistance,kind,name});}
for(const [side,sign] of [['L',-1],['R',1]] as const) {
  const word=side==='L'?'left':'right';
  const add=(key:string,name:string,x:number,y:number,kind:BrainNode['kind'],description:string,match:string[])=>brainNodes.push({id:`${side}-${key}`,name:`${side} ${name}`,x:350+sign*x,y,kind,description,match});
  add('ica','ICA',140,470,'artery','Internal carotid artery supplies anterior and middle cerebral branches.',[`${word} internal carotid artery`]);
  add('vertebral','vertebral',65,565,'artery','Vertebral artery contributes to the basilar artery and posterior inferior cerebellar supply.',[`${word} vertebral artery`]);
  add('aca','ACA',70,240,'artery','Anterior cerebral artery supplies medial frontal and parietal territories.',[`${word} anterior cerebral artery`]);
  add('mca','MCA',180,335,'artery','Middle cerebral artery supplies lateral cortex and deep perforator branches.',[`sphenoid part of ${word} middle cerebral artery`,`insular part of ${word} middle cerebral artery`]);
  add('pca','PCA',70,395,'artery','Posterior cerebral artery supplies visual, medial temporal, and deep territories.',[`precommunicating part of ${word} posterior cerebral artery`,`postcommunicating part of ${word} posterior cerebral artery`]);
  add('pcom','PCom',140,395,'artery','Posterior communicating artery connects internal carotid and posterior cerebral circulation.',[`${word} posterior communicating artery`]);
  add('frontal','medial cortex',125,135,'territory','Medial frontal and parietal beds; distal branches are lumped resistances.',[`${word} pericallosal artery`,`${word} callosomarginal artery`]);
  add('lateral','lateral cortex',265,260,'territory','Lateral cortical bed represents motor, auditory, and somatosensory demand.',[`${word} prefrontal artery`,`artery of ${word} postcentral sulcus`,`artery of ${word} precentral sulcus`,`middle temporal branch of ${word} middle cerebral artery`]);
  add('visual','visual cortex',235,395,'territory','Occipital bed receives posterior cerebral supply; light modulates demand in the schematic.',[`${word} medial occipital artery`,`${word} lateral occipital artery`]);
  add('deep','deep nuclei',70,320,'territory','Perforating vessels supply deep nuclei and hypothalamic regions. Shared bed simplifies distinct territories.',[`anterolateral central branch of ${word} middle cerebral artery`,`${word} thalamoperforating artery`,`hypothalamic branch of ${word} posterior communicating artery`,`${word} anterior choroidal artery`]);
  add('cerebellum','cerebellum / stem',230,515,'territory','Aggregates superior, anterior inferior, and posterior inferior cerebellar territories plus brainstem branches.',[`${word} superior cerebellar artery`,`${word} posterior inferior cerebellar artery`,`${word} pontine artery`,'anterior inferior cerebellar artery']);
  add('transverse','transverse sinus',290,160,'vein','Collects venous drainage toward the sigmoid sinus.',[`${word} transverse sinus`]);
  add('jugular','sigmoid → jugular',290,560,'vein','Sigmoid sinus drains to the internal jugular vein.',[`${word} sigmoid sinus`,`${word} internal jugular vein`]);
  edge('aorta',`${side}-ica`,12,'artery',`${word} internal carotid inflow`);
  edge('aorta',`${side}-vertebral`,20,'artery',`${word} vertebral inflow`);
  edge(`${side}-vertebral`,'basilar',9,'artery',`${word} vertebrobasilar junction`);
  edge(`${side}-ica`,`${side}-aca`,16,'artery',`${word} ACA A1`);edge(`${side}-aca`,'acom',12,'artery','Anterior communicating segment');
  edge(`${side}-ica`,`${side}-mca`,10,'artery',`${word} MCA M1`);
  edge(`${side}-ica`,`${side}-pcom`,15,'artery',`${word} posterior communicating artery`);
  edge(`${side}-pcom`,`${side}-pca`,15,'artery',`${word} posterior communicating junction`);
  edge('basilar',`${side}-pca`,12,'artery',`${word} PCA P1`);
  edge(`${side}-aca`,`${side}-frontal`,210,'bed','ACA cortical branches / tissue bed');
  edge(`${side}-mca`,`${side}-lateral`,120,'bed','MCA cortical branches / tissue bed');
  edge(`${side}-mca`,`${side}-deep`,650,'bed','Lenticulostriate perforators');
  edge(`${side}-pca`,`${side}-deep`,700,'bed','Posterior cerebral perforators');
  edge(`${side}-pcom`,`${side}-deep`,900,'bed','Hypothalamic perforators');
  edge(`${side}-ica`,`${side}-deep`,800,'bed','Anterior choroidal branch');
  edge(`${side}-pca`,`${side}-visual`,240,'bed','Posterior cerebral cortical branches');
  edge('basilar',`${side}-cerebellum`,650,'bed','Superior / anterior inferior cerebellar and pontine beds');
  edge(`${side}-vertebral`,`${side}-cerebellum`,750,'bed','Posterior inferior cerebellar bed');
  edge(`${side}-frontal`,'sagittal',12,'vein','Superficial cerebral veins');
  edge(`${side}-lateral`,'sagittal',15,'vein','Superior cerebral veins');
  edge(`${side}-visual`,`${side}-transverse`,18,'vein','Inferior cortical venous drainage');
  edge(`${side}-deep`,'deepvein',15,'vein','Deep cerebral venous drainage');
  edge(`${side}-cerebellum`,`${side}-transverse`,15,'vein','Posterior fossa venous drainage');
  edge('confluence',`${side}-transverse`,8,'vein','Confluence to transverse sinus');
  edge(`${side}-transverse`,`${side}-jugular`,8,'vein','Transverse to sigmoid sinus');
  edge(`${side}-jugular`,'vena',5,'vein','Internal jugular return');
}
edge('sagittal','confluence',10,'vein','Superior sagittal drainage');
edge('deepvein','straight',10,'vein','Great cerebral vein to straight sinus');
edge('straight','confluence',10,'vein','Straight sinus drainage');

export type BrainSolution={pressures:Record<string,number>;flows:Record<string,number>;totalFlow:number;residual:number;scale:number};
/** Steady resistive network: Kirchhoff conservation at every interior node. */
export function solveBrain(s:BodyState):BrainSolution {
  const pressure:Record<string,number>={aorta:s.map,vena:5};
  const nodes=brainNodes.filter(n=>!(n.id in pressure)),index=new Map(nodes.map((n,i)=>[n.id,i]));
  const n=nodes.length,a=Array.from({length:n},()=>new Float64Array(n+1));
  const conductance=(e:BrainEdge)=>{
    let demand=1;
    if(e.kind==='bed'&&e.to.endsWith('visual'))demand+=s.inputs.light*.12;
    if(e.kind==='bed'&&e.to.endsWith('lateral'))demand+=s.inputs.sound*.15+s.inputs.touch*.15+s.inputs.exercise*.12;
    if(e.kind==='bed'&&e.to.endsWith('deep'))demand+=s.inputs.pain*.15;
    return demand/e.resistance;
  };
  for(const e of brainEdges)for(const [from,to] of [[e.from,e.to],[e.to,e.from]]) {
    const row=index.get(from);if(row===undefined)continue;
    const g=conductance(e),col=index.get(to);a[row][row]+=g;
    if(col===undefined)a[row][n]+=g*pressure[to];else a[row][col]-=g;
  }
  for(let k=0;k<n;k++) {
    let pivot=k;for(let j=k+1;j<n;j++)if(Math.abs(a[j][k])>Math.abs(a[pivot][k]))pivot=j;
    [a[k],a[pivot]]=[a[pivot],a[k]];
    if(Math.abs(a[k][k])<1e-12)throw new Error('Disconnected cerebral circulation.');
    for(let j=k+1;j<n;j++){const ratio=a[j][k]/a[k][k];for(let c=k;c<=n;c++)a[j][c]-=ratio*a[k][c];}
  }
  const x=new Float64Array(n);
  for(let k=n-1;k>=0;k--){let value=a[k][n];for(let j=k+1;j<n;j++)value-=a[k][j]*x[j];x[k]=value/a[k][k];pressure[nodes[k].id]=x[k];}
  const unscaled=Object.fromEntries(brainEdges.map(e=>[e.id,(pressure[e.from]-pressure[e.to])*conductance(e)]));
  const incoming=brainEdges.filter(e=>e.from==='aorta').reduce((v,e)=>v+unscaled[e.id],0);
  // Resistance scale enforces the body model's cerebral flow allocation. This is not independent autoregulation.
  const target=(s.flows.find(f=>f.id==='brain')?.flow??.7)*1000,scale=target/incoming;
  const flows=Object.fromEntries(Object.entries(unscaled).map(([k,v])=>[k,v*scale]));
  const residual=Math.max(...nodes.map(node=>Math.abs(brainEdges.reduce((v,e)=>v+(e.to===node.id?flows[e.id]:0)-(e.from===node.id?flows[e.id]:0),0))));
  return {pressures:pressure,flows,totalFlow:target,residual,scale};
}

export function brainAtlasMatches(atlas:Atlas,node:BrainNode) {
  return atlas.parts.filter(p=>node.match.some(m=>p.name.toLowerCase()===m));
}
