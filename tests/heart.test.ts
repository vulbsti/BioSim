import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activation,atPhase,heartCycle,CHAMBERS,VALVES} from '../app/simulation/heart';
import {advance,applyAction,createBody} from '../app/simulation/engine';

const rest=heartCycle({heartRate:72,strokeVolume:70,map:93,sympathetic:.15});
const within=(value:number,low:number,high:number,name:string)=>assert.ok(value>=low&&value<=high,`${name} ${value.toFixed(2)} outside ${low} to ${high}`);

test('the resting beat reproduces the body state and sits in textbook ranges',()=>{
 const s=rest.summary;assert.ok(s.matched);
 within(s.strokeVolume,69.5,70.5,'stroke volume');assert.ok(Math.abs(s.strokeVolume-s.rightStrokeVolume)<.1);within(s.meanArterial,89,97,'mean arterial pressure');
 within(s.endDiastolic.lv,100,150,'LV end-diastolic volume');within(s.endSystolic.lv,35,70,'LV end-systolic volume');within(s.ejectionFraction,.5,.7,'ejection fraction');
 within(s.peak.aorta,100,130,'systolic pressure');within(s.aorticDiastolic,60,85,'diastolic pressure');within(s.leftVentricularEndDiastolicPressure,4,12,'LV end-diastolic pressure');
 within(s.peak.rv,18,32,'RV systolic pressure');within(s.peak.pulmonaryArtery,15,30,'pulmonary artery systolic pressure');
 within(s.endDiastolic.rv,90,170,'RV end-diastolic volume');within(s.atrialContribution,.1,.35,'atrial share of filling');
});

test('valves open and close in order, with both isovolumic phases',()=>{
 const e=rest.events;
 // Mitral closed, then aortic opens (isovolumic contraction); aortic closes, then mitral opens (isovolumic relaxation).
 assert.ok(e.aortic.opens>.02&&e.aortic.opens<e.aortic.closes&&e.aortic.closes<e.mitral.opens&&e.mitral.opens<e.mitral.closes,JSON.stringify(e));
 assert.ok(e.pulmonary.opens<e.pulmonary.closes&&e.pulmonary.closes<e.tricuspid.opens);
 const n=rest.samples;
 for(let i=0;i<n;i++){
  assert.ok(!(rest.open.mitral[i]&&rest.open.aortic[i])&&!(rest.open.tricuspid[i]&&rest.open.pulmonary[i]),`both valves of a ventricle open at sample ${i}`);
  // With both its valves shut, a ventricle keeps its volume.
  const next=(i+1)%n;if(!rest.open.mitral[i]&&!rest.open.aortic[i]&&!rest.open.mitral[next]&&!rest.open.aortic[next]&&next)assert.ok(Math.abs(rest.volume.lv[next]-rest.volume.lv[i])<.05);
 }
 // The atria contract before the ventricles: atrial volume is falling just before phase 0.
 assert.ok(atPhase(rest.volume.la,.97)<atPhase(rest.volume.la,.85)&&atPhase(rest.volume.lv,.97)>atPhase(rest.volume.lv,.85));
 assert.deepEqual([activation(0,.8).ventricle,activation(.79,.8).ventricle>0,activation(.75,.8).atrium>0],[0,false,true]);
});

test('blood volume is conserved and every trace is periodic',()=>{
 for(const k of CHAMBERS){const v=rest.volume[k];assert.ok(v.every(x=>x>0&&Number.isFinite(x)));assert.ok(Math.abs(v[0]-atPhase(v,.9999))<1.5,`${k} does not close its loop`);}
 for(const k of VALVES)assert.ok(rest.events[k].opens>=0&&rest.events[k].closes>=0);
});

test('exercise shortens the beat, raises ejection fraction and pressure; blood loss lowers filling',()=>{
 const body=createBody();applyAction(body,{kind:'environment',values:{exercise:.7}});advance(body,600);
 const hard=heartCycle(body),s=hard.summary;assert.ok(s.matched,JSON.stringify(hard.point));
 assert.ok(hard.point.heartRate>110&&s.ejectionFraction>rest.summary.ejectionFraction+.05&&s.peak.lv>rest.summary.peak.lv,JSON.stringify([hard.point,s.ejectionFraction,s.peak.lv]));
 within(s.endDiastolic.lv,100,190,'exercise LV end-diastolic volume');within(s.peak.aorta,110,190,'exercise systolic pressure');
 // Systole takes a larger share of a shorter beat.
 assert.ok(hard.events.aortic.closes>rest.events.aortic.closes);
 const low=heartCycle({heartRate:95,strokeVolume:40,map:70,sympathetic:.5});assert.ok(low.summary.matched&&low.summary.endDiastolic.lv<rest.summary.endDiastolic.lv-25&&low.summary.stressedVolume<rest.summary.stressedVolume);
 // A resting body state gives the resting beat, and the result is reused.
 assert.equal(heartCycle(createBody()),heartCycle({heartRate:72.2,strokeVolume:70.1,map:93.4,sympathetic:.15}));
});
