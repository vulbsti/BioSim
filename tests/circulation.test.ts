import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BLOOD_EDGES,BLOOD_NODES,DEFAULT_CIRCULATION,HEMATOCRIT,HEART_RATE,OUTPUT_L_S,STATE,advect,initialCirculation,pumpFlow,runCirculation,observeCirculation,exportCirculation,importCirculation,validateCirculationConfig} from '../app/circulation/model';
const result=runCirculation(),sum=(x:number[])=>x.reduce((a,b)=>a+b,0);
test('closed circulation preserves blood, plasma/RBC basis, per-node volume transfers and insulin budgets',()=>{
 assert.ok(result.maximumVolumeResidualL<1e-9);assert.ok(result.maximumInsulinResidualMol<1e-17);assert.ok(result.minimumInsulinMol>=-1e-20);
 for(const s of result.samples){
  assert.ok(Math.abs(sum(s.volumesL)*(1-HEMATOCRIT)-2.75)<1e-9);
  assert.ok(Math.abs(s.injectedPmol-s.circulatingPmol-s.interstitialPmol-sum(s.clearedPmol))<1e-5);
  BLOOD_NODES.forEach((n,i)=>{const accounted=n.volumeL+BLOOD_EDGES.reduce((v,e,j)=>v+s.integratedFlowL[j]*(e.to===n.id?1:e.from===n.id?-1:0),0);assert.ok(Math.abs(accounted-s.volumesL[i])<1e-9,`volume ledger ${n.id}`);});
 }
 assert.ok(Math.abs(result.samples.at(-1)!.injectedPmol-1200)<1e-6);
});
test('signed upwind transport preserves uniform plasma concentration and handles reverse flow',()=>{
 for(const flow of [.001,-.001]){
  const y=initialCirculation(),c=125e-12;for(let i=0;i<10;i++)y[STATE.insulin+i]=y[i]*(1-HEMATOCRIT)*c;
  const dy=Array(y.length).fill(0);advect(y,dy,0,1,flow);
  assert.ok(Math.abs(dy[0]+dy[1])<1e-15);assert.ok(Math.abs(dy[10]+dy[11])<1e-25);
  for(const i of [0,1])assert.ok(Math.abs((y[10+i]+dy[10+i])/(y[i]+dy[i])/(1-HEMATOCRIT)-c)<1e-24);
  assert.equal(Math.sign(dy[0]),-Math.sign(flow));
 }
});
test('pump beat integral equals declared cardiac output and pulse pressure is dynamic',()=>{
 const period=60/HEART_RATE,dt=period/10000;let volume=0;for(let i=0;i<10000;i++)volume+=pumpFlow((i+.5)*dt)*dt;
 assert.ok(Math.abs(volume/(period*OUTPUT_L_S)-1)<.0005);
 const beat=result.samples.filter(s=>s.time>=595);assert.ok(Math.max(...beat.map(s=>s.pressureMmHg[0]))-Math.min(...beat.map(s=>s.pressureMmHg[0]))>20);
});
test('portal first pass, no pulse, no exchange and hepatic clearance interventions have causal effects',()=>{
 const none=runCirculation({...DEFAULT_CIRCULATION,dosePmol:0},.01,60);assert.ok(none.samples.every(s=>sum(s.insulinPM)===0&&s.interstitialPM===0));
 const sealed=runCirculation({...DEFAULT_CIRCULATION,exchange:0});assert.ok(sealed.samples.every(s=>s.interstitialPM===0));
 const noLiver=runCirculation({...DEFAULT_CIRCULATION,hepaticClearance:0});assert.ok(noLiver.samples.every(s=>s.clearedPmol[0]===0));
 assert.ok(sum(noLiver.samples.map(s=>s.insulinPM[0]))>sum(result.samples.map(s=>s.insulinPM[0]))*1.3);
 const peakTime=(index:number)=>result.samples.reduce((best,s)=>s.insulinPM[index]>best.insulinPM[index]?s:best).time;
 assert.ok(peakTime(9)<peakTime(0));assert.ok(result.samples.filter(s=>s.time<=5).every(s=>s.circulatingPmol===0));
 const venous=runCirculation({...DEFAULT_CIRCULATION,route:'venous'});const first=venous.samples.find(s=>s.time===5.1)!;assert.ok(first.insulinPM[1]>first.insulinPM[2]&&first.insulinPM[2]>first.insulinPM[3]&&first.insulinPM[3]>first.insulinPM[0]);
 assert.ok(result.samples.at(-1)!.signal[20]>sealed.samples.at(-1)!.signal[20]);
});
test('step halving meets the locked pressure, hormone and source-observer tolerances',()=>{
 const fine=runCirculation(DEFAULT_CIRCULATION,.005);let pressure=0,signal=0;
 result.samples.forEach((s,i)=>{pressure=Math.max(pressure,Math.abs(s.pressureMmHg[0]-fine.samples[i].pressureMmHg[0]));signal=Math.max(signal,Math.abs(s.signal[20]-fine.samples[i].signal[20]));});
 assert.ok(pressure<=.1,`pressure ${pressure}`);assert.ok(signal<=.01,`GLUT4 ${signal}`);
 for(let node=0;node<11;node++){const peak=(r:typeof result)=>Math.max(...r.samples.map(s=>node===10?s.interstitialPM:s.insulinPM[node]));assert.ok(Math.abs(peak(result)-peak(fine))<=Math.max(.01,.002*peak(fine)));}
});
test('observation and recording preserve model state and incompatible inputs are rejected',()=>{
 const config={...DEFAULT_CIRCULATION,route:'venous' as const},text=exportCirculation(config,123.4);assert.deepEqual(importCirculation(text),{config,time:123.4});
 const before=JSON.stringify(result.samples[234]);const view=observeCirculation(result,23.45);view.insulinPM[0]=-1;assert.equal(JSON.stringify(result.samples[234]),before);
 assert.throws(()=>importCirculation(text.replace('rk4-fixed-0.01s-event-aligned-1','wrong')),/compatible/);
 assert.throws(()=>validateCirculationConfig({...config,exchange:NaN}),/supported/);assert.throws(()=>validateCirculationConfig({...config,unknown:1}),/supported/);
 assert.throws(()=>runCirculation(config,.1),/solver/);assert.throws(()=>exportCirculation(config,Infinity),/playhead/);
});
