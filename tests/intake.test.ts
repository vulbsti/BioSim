import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import type {AddressInfo} from 'node:net';
import {intakeServer} from '../intake/server';
import type {Reader,ReportReading,ColumnMap} from '../intake/llm';
import {processUpload} from '../intake/process';
import {parseCgm} from '../app/personal/cgm';
import {emptyData,merge,parseTime,readings} from '../app/personal/data';
import {findMeals,resample} from '../app/personal/day';

const sample=(name:string)=>readFileSync(new URL(`../public/samples/personal/${name}`,import.meta.url));
// What a model would copy off the sample report, as printed (see scripts/personal/make-samples.py).
const REPORT:ReportReading={isBloodTest:true,collected:'2017-03-14T07:40',notes:'',results:[
 ['Glucose, fasting',7.4,'mmol/L'],['HbA1c (IFCC)',53,'mmol/mol'],['Insulin, fasting',125,'pmol/L'],['Triglycerides',2.3,'mmol/L'],['ALT (SGPT)',61,'U/L'],
 ['Creatinine',88,'µmol/L'],['eGFR (CKD-EPI)',84,'mL/min/1.73m²'],['TSH',2.6,'mU/L'],['Free T4',14.1,'pmol/L'],['Haemoglobin',148,'g/L'],['Vitamin D (25-OH)',41,'nmol/L']]
 .map(([name,value,unit])=>({name:String(name),value:Number(value),unit:String(unit),flag:'',date:''}))};
/** Stands in for Claude: records what it was asked and answers like the real one would. */
const fake=()=>{const asked:string[]=[];const reader:Reader={
 async readReport(input){asked.push(input.kind);return input.kind==='text'&&!/glucose/i.test(input.text)?{isBloodTest:false,collected:'',results:[],notes:''}:REPORT;},
 async mapColumns(header):Promise<ColumnMap>{asked.push(`columns:${header.join('|')}`);return {time:'Zeit',dateOrder:'dmy',columns:[{header:'Zeit',kind:'ignore',unit:''},{header:'Blutzucker',kind:'glucose',unit:'mmol/L'},{header:'Puls',kind:'heartRate',unit:'bpm'}]};}};return {reader,asked};};

test('files the parsers know never reach the model',async()=>{
 const {reader,asked}=fake();
 const cgm=await processUpload('sam-dexcom.csv',sample('sam-dexcom.csv'),reader);
 assert.equal(cgm.kind,'glucose sensor');assert.deepEqual(cgm.steps.map(s=>s.step),['parser','result']);
 const band=await processUpload('sam-apple-health.xml',sample('sam-apple-health.xml'),reader);
 assert.equal(band.kind,'band');assert.match(band.steps[0].detail,/Apple Health/);
 assert.ok(band.data.intervals.some(i=>i.kind==='workout')&&band.data.series.some(s=>s.kind==='hrvSdnn'));
 assert.deepEqual(asked,[]);
});

test('a PDF report goes to the model, and its values pass through the same unit checks as typed ones',async()=>{
 const {reader,asked}=fake();
 const r=await processUpload('sam-blood-test.pdf',sample('sam-blood-test.pdf'),reader);
 assert.deepEqual(asked,['pdf']);assert.equal(r.kind,'blood test');
 const v=Object.fromEntries(r.data.labs.map(l=>[l.analyte,l.value]));
 assert.ok(Math.abs(v.glucose-133.3)<0.1&&Math.abs(v.hba1c-7.0)<0.01&&Math.abs(v.insulin-20.83)<0.01,JSON.stringify(v));
 assert.ok(Math.abs(v.triglycerides-203.7)<0.1&&v.egfr===84&&v.tsh===2.6&&Math.abs(v.ft4-1.096)<0.001&&v.hemoglobin===14.8);
 assert.equal(r.data.labs[0].at,Date.UTC(2017,2,14,7,40));
 assert.deepEqual(r.unused.map(u=>u.name),['Vitamin D (25-OH)']);assert.match(r.warnings.join(' '),/Not used yet.*Vitamin D/);
 assert.match(r.steps.find(s=>s.step==='model')!.detail,/read 11 results off the PDF/);
 // Without a model the file is kept but nothing is guessed.
 const none=await processUpload('sam-blood-test.pdf',sample('sam-blood-test.pdf'),null);
 assert.equal(none.kind,'nothing found');assert.match(none.warnings[0],/No model is set up/);
});

test('an unfamiliar CSV gets its columns named by the model, then the parsers read it',async()=>{
 const {reader,asked}=fake();
 const csv='Zeit;Blutzucker;Puls\n14.03.2017 08:00;6,1;72\n14.03.2017 08:15;7,9;75\n14.03.2017 08:30;9,2;80\n';
 const r=await processUpload('export.csv',Buffer.from(csv),reader);
 assert.deepEqual(asked,['columns:Zeit|Blutzucker|Puls']);assert.equal(r.kind,'mixed');
 const g=readings(r.data,'glucose');assert.equal(g[0].t,Date.UTC(2017,2,14,8));assert.equal(Math.round(g[2].v),166);
 assert.deepEqual(readings(r.data,'heartRate').map(p=>p.v),[72,75,80]);
 assert.match(r.steps.find(s=>s.step==='model')!.detail,/Blutzucker = glucose \(mmol\/L\)/);
});

test('the backend keeps uploads, combines them, and serves the baseline and a day replay',async()=>{
 const dir=mkdtempSync(`${tmpdir()}/intake-`),{reader}=fake();
 const server=intakeServer({dir,reader}).listen(0);await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
 try{
  assert.deepEqual(await (await fetch(`${base}/status`)).json(),{model:'claude-opus-5-5',files:0});
  for(const name of ['sam-dexcom.csv','sam-apple-health.xml','sam-blood-test.pdf']){
   const r=await fetch(`${base}/uploads`,{method:'POST',headers:{'x-filename':name},body:sample(name)});assert.equal(r.status,201);}
  const list=await (await fetch(`${base}/uploads`)).json();assert.deepEqual(list.map((f:{kind:string})=>f.kind),['glucose sensor','band','blood test']);
  const p=await (await fetch(`${base}/personal`)).json();
  assert.ok(p.baseline.params.insulinSensitivity<0.5,'fasting glucose 133 and insulin 21 read as slow sugar uptake');
  assert.ok(p.baseline.params.autonomicTone>0,'SDNN around 31 ms leans to the stress side');assert.ok(p.days.length>=6);
  const day=p.days[2].day,replay=await (await fetch(`${base}/replay?day=${day}`)).json();
  assert.equal(replay.start,day+8*3600000);assert.ok(replay.measured.glucose.length>250);
  assert.ok(replay.scenario.events.some((e:{label:string})=>/Asleep/.test(e.label))&&replay.scenario.events.some((e:{label:string})=>/Walking/.test(e.label)));
  // Kept across a restart.
  const again=intakeServer({dir,reader}).listen(0);await new Promise(r=>again.once('listening',r));
  const list2=await (await fetch(`http://127.0.0.1:${(again.address() as AddressInfo).port}/api/uploads`)).json();again.close();
  assert.equal(list2.length,3);
  await fetch(`${base}/uploads/${list[0].id}`,{method:'DELETE'});assert.equal((await (await fetch(`${base}/uploads`)).json()).length,2);
 }finally{server.close();}
});

test('on real CGM data, meals are found near the logged standardised breakfasts (Hall et al. 2018)',()=>{
 const meals=JSON.parse(sample('hall-meals.json').toString()) as {subject:string;meal:string;time:string}[];
 const data=merge(merge(emptyData(),parseCgm(sample('sam-dexcom.csv').toString())),parseCgm(sample('hall-2133-039-libre.csv').toString()));
 const g=readings(data,'glucose');
 const sam=readings(merge(emptyData(),parseCgm(sample('sam-dexcom.csv').toString())),'glucose'),other=readings(merge(emptyData(),parseCgm(sample('hall-2133-039-libre.csv').toString())),'glucose');
 assert.ok(g.length>sam.length);
 const found=(points:typeof g)=>findMeals(resample(points,points[0].t,points.at(-1)!.t,5*60000));
 const bySubject:Record<string,ReturnType<typeof found>>={'2133-018':found(sam),'2133-039':found(other)};
 const series:Record<string,typeof g>={'2133-018':sam,'2133-039':other};
 // A breakfast can only be judged where the sensor kept reading through it (no gap over 30 min).
 const covered=(points:typeof g,t:number)=>{const w=points.filter(p=>p.t>=t-1800000&&p.t<=t+7200000);return w.length>1&&w[0].t-(t-1800000)<1800000&&t+7200000-w.at(-1)!.t<1800000&&w.every((p,i)=>!i||p.t-w[i-1].t<=1800000);};
 // and where the sugar visibly rose (25 mg/dL or more within two hours): a low-sugar sandwich can barely move it.
 const rose=(points:typeof g,t:number)=>{const w=points.filter(p=>p.t>=t-900000&&p.t<=t+7200000).map(p=>p.v);return Math.max(...w)-w[0]>=25;};
 const results=meals.filter(m=>bySubject[m.subject]).map(m=>{const t=parseTime(m.time);const near=bySubject[m.subject].reduce((a,b)=>Math.abs(b.at-t)<Math.abs(a.at-t)?b:a);return {...m,off:Math.round((near.at-t)/60000),carbs:near.carbs,covered:covered(series[m.subject],t)};});
 console.log('  logged breakfast vs nearest meal found (minutes):',results.map(r=>`${r.subject} ${r.meal} ${r.off>0?'+':''}${r.off}${r.covered?'':' (sensor gap)'}${r.covered&&!rose(series[r.subject],parseTime(r.time))?' (no visible rise)':''}`).join('; '));
 const judged=results.filter(r=>r.covered&&rose(series[r.subject],parseTime(r.time)));
 assert.equal(results.length,6);assert.ok(judged.length>=3,JSON.stringify(results));
 assert.ok(judged.every(r=>Math.abs(r.off)<=20),JSON.stringify(judged));
});
