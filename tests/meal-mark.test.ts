import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advance,applyAction,createBody,MODEL_VERSION} from '../app/simulation/engine';
import {markedTotal} from '../app/simulation/transport';
import {parseRecording} from '../app/simulation/recording';
import {setMultiscaleMeal} from '../app/simulation/multiscale-meal';
import {NUTRIENTS,type BodyState} from '../app/simulation/types';

const meal={carbs:60,protein:20,fat:15,water:250,sodium:500};
const fed=(seconds:number,prepare?:(s:BodyState)=>void)=>{const s=createBody();prepare?.(s);applyAction(s,{kind:'meal',meal});advance(s,seconds);return s;};
const conserved=(s:BodyState)=>{const total=markedTotal(s);for(const key of NUTRIENTS)assert.ok(Math.abs(total[key]-s.transport.mark.eaten[key])<1e-9,`${key} ${total[key]} of ${s.transport.mark.eaten[key]}`);};
const label=(s:BodyState,id:string)=>s.transport.mark.pools[id].glucose;

test('the label always sums to what the meal contained and never exceeds what a pool holds',()=>{
 const s=createBody();assert.equal(s.transport.mark.at,-1);advance(s,600);assert.deepEqual(markedTotal(s),{glucose:0,aminoAcids:0,lipids:0});
 applyAction(s,{kind:'meal',meal});assert.equal(s.transport.mark.at,600);assert.deepEqual(s.transport.mark.pools.stomach,{glucose:60,aminoAcids:20,lipids:15});
 for(let i=0;i<24;i++){
  advance(s,600);conserved(s);
  for(const [id,c] of Object.entries(s.transport.compartments))for(const key of NUTRIENTS){const marked=s.transport.mark.pools[id][key];assert.ok(marked>=-1e-12&&marked<=c.amounts[key]+1e-9,`${id} ${key} ${marked} of ${c.amounts[key]}`);}
 }
 // Four hours on, most of the carbohydrate has been stored or burned, and little is left in the gut.
 const p=s.transport.mark.pools;assert.ok(p.stomach.glucose+p['intestinal lumen'].glucose<3);assert.ok(p['hepatic glycogen'].glucose>5&&p['oxidized substrate'].glucose>5,JSON.stringify([p['hepatic glycogen'].glucose,p['oxidized substrate'].glucose]));
});

test('marking a meal changes nothing in the physiology',()=>{
 const marked=fed(3600),plain=createBody();
 // The same run with the label switched off straight after the meal.
 applyAction(plain,{kind:'meal',meal});plain.transport.mark.at=-1;advance(plain,3600);
 const strip=(s:BodyState)=>({...s,transport:{...s.transport,mark:null}});
 assert.deepEqual(strip(marked),strip(plain));
});

test('the meal reaches the portal vein, then the liver, then the arteries, and fat arrives by lymph',()=>{
 const share=(s:BodyState,id:string)=>label(s,id)/s.transport.compartments[id].amounts.glucose;
 const early=fed(300);assert.ok(share(early,'portal')>share(early,'liver-blood')&&share(early,'liver-blood')>share(early,'arterial')&&share(early,'arterial')>0,JSON.stringify(['portal','liver-blood','arterial'].map(id=>share(early,id))));
 const later=fed(1800);assert.ok(share(later,'portal')>.3&&share(later,'arterial')>.05&&label(later,'muscle-tissue')>0&&label(later,'hepatic glycogen')>0);
 assert.equal(later.transport.mark.pools.portal.lipids>0,true);assert.ok(later.transport.mark.pools.lymph.lipids>0&&later.transport.mark.pools['muscle-tissue'].lipids>0);
});

test('a new meal takes over the mark',()=>{
 const s=fed(1800);applyAction(s,{kind:'meal',meal:{carbs:30,protein:5,fat:5,water:100,sodium:0}});
 assert.equal(s.transport.mark.at,1800);assert.deepEqual(markedTotal(s),{glucose:30,aminoAcids:5,lipids:5});
 // The first meal's leftovers in the stomach are no longer labelled.
 assert.ok(s.stomach.carbs>30);assert.equal(s.transport.mark.pools.portal.glucose,0);advance(s,1800);conserved(s);
});

test('the label follows the refined muscle pathway and survives a saved run',()=>{
 const s=fed(1800,b=>setMultiscaleMeal(b,true,1));conserved(s);assert.ok(label(s,'muscle-cell')>0);
 const saved=JSON.stringify({model:MODEL_VERSION,exportedAt:'',state:s,reference:null,scope:''}),back=parseRecording(saved).state;
 assert.deepEqual(back.transport.mark,s.transport.mark);
 // A run saved before meals were labelled resumes with no meal marked.
 const old=JSON.parse(JSON.stringify({model:MODEL_VERSION,exportedAt:'',state:fed(600),reference:null,scope:''}));delete old.state.transport.mark;
 assert.equal(parseRecording(JSON.stringify(old)).state.transport.mark.at,-1);
 const broken=JSON.parse(saved);broken.state.transport.mark.pools.portal.glucose+=1;assert.throws(()=>parseRecording(JSON.stringify(broken)),/not conserved/);
});
