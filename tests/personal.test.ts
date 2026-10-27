import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advance,createBody,glucose,schedule} from '../app/simulation/engine';
import {days,emptyData,merge,parseTime,readings} from '../app/personal/data';
import {parseCgm} from '../app/personal/cgm';
import {latest,parseFhir,parsePanelText,toStandard,egfrFromCreatinine,analyteFor} from '../app/personal/panel';
import {parseAppleHealth,AppleHealthReader,parseOura,parseBandCsv} from '../app/personal/band';
import {personalBaseline,TYPICAL} from '../app/personal/baseline';
import {dayReplay,findMeals,follow,resample,sleepBlocks} from '../app/personal/day';

const fixture=(name:string)=>readFileSync(new URL(`./fixtures/personal/${name}`,import.meta.url),'utf8');
const at=(s:string)=>parseTime(s);
const near=(a:number,b:number,tol:number,what='')=>assert.ok(Math.abs(a-b)<=tol,`${what} ${a} is not within ${tol} of ${b}`);

test('times are wall-clock: a zone offset is dropped, day and month order is read from the data',()=>{
 assert.equal(at('2026-10-01 13:10:00 +0100'),Date.UTC(2026,9,1,13,10));
 assert.equal(at('2026-09-30T23:10:00.000+01:00'),Date.UTC(2026,8,30,23,10));
 assert.equal(parseTime('01-10-2026 13:10','dmy'),Date.UTC(2026,9,1,13,10));
 assert.equal(parseTime('10-01-2026 1:10 PM','mdy'),Date.UTC(2026,9,1,13,10));
 // 30 can only be a day, whichever order was asked for.
 assert.equal(parseTime('30-09-2026 06:00','mdy'),Date.UTC(2026,8,30,6));
 assert.ok(Number.isNaN(at('yesterday')));
});

test('a LibreView export in mmol/L with day-first dates reads as mg/dL, scans included',()=>{
 const r=parseCgm(fixture('libre.csv'));
 assert.equal(r.source,'CGM');assert.deepEqual(r.warnings,[]);
 const g=r.series[0];assert.equal(g.kind,'glucose');assert.equal(g.points.length,209);
 assert.equal(g.points[0].t,Date.UTC(2026,8,30,6));near(g.points[0].v,5.3*18.016,1e-9);
 assert.ok(g.points.some(p=>p.t===Date.UTC(2026,9,1,13,52)&&Math.abs(p.v-7.9*18.016)<1e-9),'the scan reading is kept');
 assert.ok(g.points.every((p,i)=>i===0||p.t>g.points[i-1].t));
});

test('a Dexcom Clarity export skips the patient rows and holds "Low" at the sensor limit',()=>{
 const r=parseCgm(fixture('dexcom.csv'));
 const g=r.series[0].points;assert.equal(g.length,384);
 assert.equal(g[0].t,Date.UTC(2026,9,1,0,0));assert.equal(g[30].v,40);
 assert.match(r.warnings.join(' '),/1 readings were past/);
});

test('a plain file of time and glucose, and a file that is not glucose',()=>{
 const r=parseCgm('time,glucose\n2026-10-01 08:00,5.1\n2026-10-01 08:15,6.0\n');
 assert.deepEqual(r.series[0].points.map(p=>Math.round(p.v)),[92,108]);
 assert.equal(parseCgm('name,age\nasha,36\n').series.length,0);
});

test('a pasted report is read line by line, in any of the usual units',()=>{
 const r=parsePanelText(fixture('panel.txt'));
 const l=latest(r.labs);
 assert.equal(r.labs.length,16,r.labs.map(x=>x.analyte).join());
 near(l.glucose!.value,97.3,0.1,'glucose');near(l.hba1c!.value,5.72,0.01,'HbA1c');near(l.insulin!.value,14,1e-9,'insulin');
 near(l.triglycerides!.value,168,0.5,'TG');near(l.hdl!.value,54.1,0.1,'HDL');near(l.ldl!.value,119.9,0.1,'LDL');near(l.cholesterol!.value,197.2,0.1);
 near(l.ft4!.value,1.228,0.001,'fT4');near(l.creatinine!.value,0.814,0.001);near(l.hemoglobin!.value,13.2,1e-9);
 assert.equal(l.egfr!.value,90);assert.equal(l.alt!.value,52);assert.equal(l.ferritin!.value,45);
 assert.deepEqual(l.insulin!.entered,{value:84,unit:'pmol/L'});
 assert.deepEqual(r.warnings,[]);
});

test('names and units that look alike go to the right test',()=>{
 assert.equal(analyteFor('HDL Cholesterol'),'hdl');assert.equal(analyteFor('Cholesterol, total'),'cholesterol');
 assert.equal(analyteFor('Insulin, fasting'),'insulin');assert.equal(analyteFor('hs-CRP'),'crp');assert.equal(analyteFor('Vitamin D'),null);
 near(toStandard('creatinine',88.42,'µmol/L'),1,1e-9);near(toStandard('insulin',60,'pmol/l'),10,1e-9);near(toStandard('hemoglobin',8.4,'mmol/L'),13.53,0.01);
 assert.ok(Number.isNaN(toStandard('glucose',5,'g/dL')));
 const wrong=parsePanelText('Glucose 5.4 g/dL\nHbA1c 5.6 %');assert.equal(wrong.labs.length,1);assert.match(wrong.warnings[0],/unit "g\/dL"/);
 // 2021 CKD-EPI: a 50 year old woman at 0.7 mg/dL is 142 × 0.9938^50 × 1.012 = 105.3.
 near(egfrFromCreatinine(0.7,50,'female'),105.3,0.1);
});

test('a FHIR bundle is matched by LOINC code, then by name; unknown tests are skipped',()=>{
 const r=parseFhir(fixture('fhir-bundle.json'));
 assert.deepEqual(r.labs.map(l=>[l.analyte,l.value]),[['hba1c',5.7],['glucose',97],['insulin',14]]);
 assert.equal(r.labs[0].at,Date.UTC(2026,8,28,8,10));
 assert.match(parseFhir('{nope').warnings[0],/not valid JSON/);
});

test('an Apple Health export gives heart, HRV, steps, SpO2, sleep stages and workouts on the local clock',()=>{
 const xml=fixture('apple-export.xml'),r=parseAppleHealth(xml);
 const kinds=Object.fromEntries(r.series.map(s=>[s.kind,s.points]));
 assert.deepEqual(Object.keys(kinds).sort(),['heartRate','hrvSdnn','respiratoryRate','restingHeartRate','spo2','steps']);
 assert.equal(kinds.heartRate.length,156);assert.equal(kinds.heartRate[0].t,Date.UTC(2026,8,30,22));
 assert.equal(kinds.spo2[0].v,97);assert.equal(kinds.steps.length,7);assert.ok(kinds.steps.filter(p=>p.v===575).every(p=>p.end!-p.t===300000));
 const sleep=r.intervals.filter(i=>i.kind==='sleep');assert.deepEqual(sleep.map(s=>s.kind==='sleep'&&s.stage),['light','deep','awake','rem','light']);
 const run=r.intervals.find(i=>i.kind==='workout')!;assert.ok(run.kind==='workout'&&run.activity==='Running'&&run.start===Date.UTC(2026,9,1,18));
 // Streaming the file in small pieces gives exactly the same result.
 const reader=new AppleHealthReader();for(let i=0;i<xml.length;i+=97)reader.push(xml.slice(i,i+97));
 assert.deepEqual(reader.finish(),r);
});

test('Oura sleep JSON becomes stage intervals and five-minute heart rate and RMSSD',()=>{
 const r=parseOura(fixture('oura-sleep.json'));
 const sleep=r.intervals;assert.equal(sleep[0].start,Date.UTC(2026,8,30,23,10));assert.ok(sleep[0].kind==='sleep'&&sleep[0].stage==='awake'&&sleep[0].end-sleep[0].start===600000);
 assert.equal(sleep.at(-1)!.end,Date.UTC(2026,8,30,23,10)+49*300000);
 const hrv=r.series.find(s=>s.kind==='hrvRmssd')!.points;assert.equal(hrv.length,19);assert.equal(hrv[0].t,Date.UTC(2026,8,30,23,15));
 assert.equal(r.series.find(s=>s.kind==='heartRate')!.points.length,19);
});

test('a plain band CSV maps its columns by name, and sleep stages last until the next row',()=>{
 const r=parseBandCsv(fixture('band.csv'));
 assert.deepEqual(r.series.map(s=>s.kind).sort(),['heartRate','hrvRmssd','spo2','steps']);
 const steps=r.series.find(s=>s.kind==='steps')!.points.find(p=>p.v===1650)!;assert.equal(steps.end!-steps.t,15*60000);
 assert.deepEqual(r.intervals.map(i=>i.kind==='sleep'&&i.stage),['light','deep','rem','awake']);
});

test('merging the same file twice does not count it twice',()=>{
 const g=parseCgm(fixture('dexcom.csv'));const once=merge(emptyData(),g),twice=merge(once,g);
 assert.equal(twice.series[0].points.length,once.series[0].points.length);
 assert.deepEqual(days(once,'glucose',5*60000).map(d=>[new Date(d.day).toISOString().slice(0,10),d.coverage]),[['2026-10-01',1],['2026-10-02',.3333333333333333]]);
});

test('the baseline leans the way the numbers lean, and says why',()=>{
 assert.deepEqual(personalBaseline(emptyData()).params,TYPICAL);
 let data=merge(emptyData(),parsePanelText(fixture('panel.txt')));
 data=merge(data,parseAppleHealth(fixture('apple-export.xml')));
 const b=personalBaseline(data,{age:36,sex:'female'});
 // HOMA-IR 97.3*14/405 = 3.4: insulin works at about a third of typical; the pancreas works harder.
 near(b.params.insulinSensitivity,0.3,0.01);assert.ok(b.params.betaCellResponse>1.3);
 assert.match(b.reasons.insulinSensitivity!.why,/slow to take up sugar/);assert.deepEqual(b.reasons.insulinSensitivity!.from,['Fasting glucose','Fasting insulin']);
 near(b.params.metabolicRate,0.97,0.03);near(b.params.kidneyClearance,0.9,1e-9);near(b.params.oxygenCarrying,0.91,0.01);
 assert.equal(b.params.restingHeartRate,56);assert.ok(b.params.autonomicTone<0,'HRV above typical leans calm');
 const liver=b.tints.find(t=>t.organ==='liver')!;assert.match(liver.why,/ALT, Triglycerides are above typical/);
 assert.ok(b.tints.find(t=>t.organ==='muscle')!.level<0);
 assert.ok(!b.missing.includes('liver')&&b.missing.includes('skin'));
 // Without insulin, HbA1c alone gives a rough answer.
 const rough=personalBaseline(merge(emptyData(),parsePanelText('HbA1c 6.4 %')));
 assert.ok(rough.params.insulinSensitivity<0.7);assert.equal(rough.reasons.insulinSensitivity!.confidence,'rough');
 // Resting heart rate comes from the lowest night heart rates when the band gives no resting value.
 const hr=Array.from({length:60},(_,i)=>({t:Date.UTC(2026,9,1,0,i*5),v:50+(i%7)}));
 assert.equal(personalBaseline({series:[{kind:'heartRate',source:'x',points:hr}],intervals:[],labs:[]}).params.restingHeartRate,50);
});

test('meals are found from rises in the curve, at the right times and roughly the right size',()=>{
 const g=readings(merge(emptyData(),parseCgm(fixture('dexcom.csv'))),'glucose');
 const grid=resample(g,Date.UTC(2026,9,1),Date.UTC(2026,9,2));
 const meals=findMeals(grid);
 // The fixture day has meals at 08:30 (45 g), 13:10 (75 g) and 19:40 (60 g).
 assert.equal(meals.length,3,JSON.stringify(meals));
 [[8.5,45],[13+10/60,75],[19+40/60,60]].forEach(([h,c],i)=>{near(meals[i].at,Date.UTC(2026,9,1)+h*3600000,20*60000,`meal ${i} time`);near(meals[i].carbs,c,c*0.25,`meal ${i} carbs`);});
 // A flat day has no meals.
 assert.deepEqual(findMeals(resample(g.map(p=>({t:p.t,v:90+(p.t/300000%3)})),g[0].t,g.at(-1)!.t)),[]);
 // A gap in the readings is left empty, not drawn across.
 const gap=resample([{t:0,v:90},{t:3600000,v:120}],0,3600000);assert.equal(gap.length,2);
});

test('sleep blocks join short wakings and drop naps under 20 minutes',()=>{
 const r=parseAppleHealth(fixture('apple-export.xml'));
 assert.deepEqual(sleepBlocks(r.intervals),[{start:Date.UTC(2026,8,30,23,15),end:Date.UTC(2026,9,1,6,45)}]);
});

test('a measured day replays: meals, sleep and activity land at the right simulated time, and the model follows the curve',()=>{
 let data=merge(emptyData(),parseCgm(fixture('dexcom.csv')));data=merge(data,parseAppleHealth(fixture('apple-export.xml')));
 const d=dayReplay(data,Date.UTC(2026,9,1,12));
 assert.equal(d.start,Date.UTC(2026,9,1,8));assert.equal(d.scenario.duration,86400);assert.equal(d.scenario.id,'day-2026-10-01');
 const meals=d.scenario.events.filter(e=>e.action.kind==='meal');assert.equal(meals.length,3);
 near(meals[0].at,30*60,20*60,'breakfast');
 // The run at 18:00 and the walk at 13:45 both show as activity, and end.
 const ex=d.scenario.events.filter(e=>e.action.kind==='environment'&&'exercise' in e.action.values);
 const level=(sec:number)=>{let v=0;for(const e of ex)if(e.at<=sec&&e.action.kind==='environment')v=e.action.values.exercise!;return v;};
 assert.equal(level(10*3600+20*60),.7);assert.ok(level(5*3600+50*60)>=.3);assert.equal(level(12*3600),0);assert.equal(level(9*3600),0);
 // The night of 30 September falls before this day starts; in the day before it, sleep from 23:15 is
 // 15 h 15 min after the 08:00 start, and waking at 06:45 is 22 h 45 min.
 const asleep=(r:typeof d)=>r.scenario.events.filter(e=>e.action.kind==='environment'&&'sleep' in e.action.values).map(e=>[e.at/60,e.action.kind==='environment'&&e.action.values.sleep]);
 assert.deepEqual(asleep(d),[]);assert.deepEqual(asleep(dayReplay(data,Date.UTC(2026,8,30,12))),[[15*60+15,1],[22*60+45,0]]);
 assert.equal(d.measured.glucose[0].time,0);assert.equal(d.measured.glucose.length,288);
 // Played through the engine, the modelled glucose rises after each meal it was given (A3 direction).
 const s=createBody();for(const e of d.scenario.events)schedule(s,e.at,e.action,e.label);
 const model:{time:number;value:number}[]=[];
 for(let t=0;t<=14*3600;t+=300){advance(s,t-s.time);model.push({time:t,value:glucose(s)});}
 for(const m of meals.slice(0,2)){const before=model.find(p=>p.time>=m.at)!.value,after=Math.max(...model.filter(p=>p.time>m.at&&p.time<=m.at+5400).map(p=>p.value));assert.ok(after>before+10,`model rises after the meal at ${m.at}: ${before} to ${after}`);}
 const f=follow(model,d.measured.glucose.filter(p=>p.time<=14*3600));
 assert.ok(f.points>150);assert.ok(Number.isFinite(f.mean));
 console.log(`  model vs measured glucose, first 14 h: mean gap ${f.mean.toFixed(1)} mg/dL, largest ${f.max.toFixed(0)}, ${(f.within*100).toFixed(0)}% within 20`);
});
