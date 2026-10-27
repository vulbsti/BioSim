import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {KICK,SEATED,SLOW,frameAt,length,poseLeg,reflexTiming,route,schedule,type KneeJerkRoutes,type LegJoints} from '../app/physical/knee-jerk';

const read=<T>(file:string)=>JSON.parse(readFileSync(new URL(`../public/models/${file}`,import.meta.url),'utf8')) as T;
const paths=read<{kneeJerk:Record<keyof KneeJerkRoutes,{to:string;points:number[]}[]>;joints:LegJoints}>('nerve-paths.json');
const routes={afferent:paths.kneeJerk.afferent.map(r=>route(r.to,r.points)),efferent:paths.kneeJerk.efferent.map(r=>route(r.to,r.points)),inhibitory:paths.kneeJerk.inhibitory.map(r=>route(r.to,r.points))};
const timing=reflexTiming(routes);
const nerves=read<Atlas>('nerves.json'),atlas=read<Atlas>('atlas.json');
const first=(r:{points:Float32Array})=>[...r.points.subarray(0,3)],last=(r:{points:Float32Array})=>[...r.points.subarray(r.points.length-3)];
const box=(name:string)=>{const p=atlas.parts.find(x=>x.name.toLowerCase()===name);assert.ok(p,`no ${name}`);return p!.bounds;};
const within=(p:number[],b:number[][],pad=.01)=>[0,1,2].every(k=>p[k]>=b[0][k]-pad&&p[k]<=b[1][k]+pad);

test('the reflex loop runs from each head of quadriceps to the cord and back to the same head',()=>{
 assert.deepEqual(routes.afferent.map(r=>r.to).sort(),['right rectus femoris','right vastus intermedius','right vastus lateralis','right vastus medialis']);
 assert.deepEqual(routes.efferent.map(r=>r.to).sort(),routes.afferent.map(r=>r.to).sort());
 assert.equal(routes.inhibitory.length,3);
 for(const r of routes.afferent){assert.ok(within(first(r),box(r.to)),`${r.to}: sensory signal does not start in its muscle`);}
 for(const r of routes.efferent){assert.ok(within(last(r),box(r.to)),`${r.to}: motor signal does not end in its muscle`);}
 for(const r of routes.inhibitory){assert.ok(within(last(r),box(r.to)),`${r.to}: relax signal does not end in its muscle`);}
 // Sensory signals enter the cord where motor signals leave it: in the lumbar spine, beside the midline.
 const cord=nerves.parts.find(p=>p.name==='Spinal cord')!.bounds;
 for(const r of routes.afferent){const end=last(r);assert.ok(Math.abs(end[0])<.03&&end[1]>box('second lumbar vertebra')[0][1]-.04&&end[1]<box('first lumbar vertebra')[1][1]+.03,`${r.to}: enters the cord at ${end.map(x=>x.toFixed(3))}`);assert.ok(within(end,cord,.02));}
 for(const r of routes.efferent){const a=first(r),b=last(routes.afferent[0]);assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<.03,'motor root leaves the cord far from where the sensory root enters');}
 // Real path lengths: hip to mid-thigh plus the femoral nerve up to the lumbar spine, about half to three quarters of a metre.
 for(const r of [...routes.afferent,...routes.efferent])assert.ok(length(r)>.45&&length(r)<.85,`${r.to}: ${length(r).toFixed(3)} m`);
});

test('timing follows nerve length and conduction speed: the patellar reflex latency of an adult',()=>{
 // Clinical T-reflex latency of quadriceps in adults is about 15-25 ms (tap to EMG onset).
 assert.ok(timing.muscleOnset>.015&&timing.muscleOnset<.026,`latency ${(timing.muscleOnset*1000).toFixed(1)} ms`);
 // Signals reach the cord before the command leaves it, and the command reaches the muscle after that.
 assert.ok(timing.atCord<timing.motorStart&&timing.motorStart<timing.muscleOnset);
 // Hamstrings are held off by the time quadriceps pulls, give or take a millisecond or two.
 assert.ok(Math.abs(timing.hamstringsOff-timing.muscleOnset)<.004);
});

test('on screen the steps come in order: tap, sensing, cord, command, kick, then the leg hangs again',()=>{
 const k=schedule(timing),order=['ready','tap','sensory','cord','motor','kick'];
 let seen=0,peak=0,knee0=frameAt(timing,k.tap).knee;
 for(let s=0;s<=k.end;s+=.01){const f=frameAt(timing,s),at=order.indexOf(f.stage);assert.ok(at>=seen,`stage went back to ${f.stage} at ${s.toFixed(2)} s`);seen=at;peak=Math.max(peak,f.quadriceps);
  if(f.stage==='sensory')assert.ok(!Number.isNaN(f.afferent)&&Number.isNaN(f.efferent),'only the sensing signal travels before the cord');
  if(f.quadriceps>0)assert.ok(s>=k.kick,'muscle tightens before the command arrives');}
 assert.equal(seen,order.length-1);assert.ok(peak>.99);
 const kick=frameAt(timing,k.kick+k.rise);assert.ok(Math.abs(knee0-kick.knee-KICK)<.01,'the kick straightens the knee by KICK');assert.ok(kick.hamstrings>.9,'hamstrings relaxed during the kick');
 const end=frameAt(timing,k.end);assert.ok(Math.abs(end.knee-SEATED.knee)<1e-6&&end.quadriceps<1e-6,'leg hangs again at the end');
 // The slow-down is stated, and the signal phase stays watchable (between 1 and 4 seconds on screen).
 assert.ok((k.kick-k.sensory)>1&&(k.kick-k.sensory)<4&&SLOW>=50);
});

test('the seated pose moves the leg, not the arms, the other leg or the trunk',()=>{
 const j=paths.joints,seat=[[SEATED.hip,SEATED.knee],[SEATED.hip,SEATED.knee]] as [[number,number],[number,number]];
 const centre=(name:string)=>{const b=box(name);return [0,1,2].map(k=>(b[0][k]+b[1][k])/2);};
 const moved=(p:number[],angles=seat)=>{const q=poseLeg(p,j,angles);return Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);};
 for(const part of ['right capitate','left capitate','right fifth metacarpal bone','distal phalanx of right middle finger','sacrum','fifth lumbar vertebra','urinary bladder'])assert.ok(moved(centre(part))<.002,`${part} moved ${moved(centre(part)).toFixed(3)} m`);
 // Seated: the right knee comes forward to about thigh length in front of the hip; the foot hangs below the knee.
 const knee=poseLeg(j.right.knee,j,seat),foot=poseLeg(j.right.ankle,j,seat);
 assert.ok(knee[2]-j.right.hip[2]>.3&&Math.abs(knee[1]-j.right.hip[1])<.1,`knee at ${knee.map(x=>x.toFixed(3))}`);
 assert.ok(knee[1]-foot[1]>.3&&Math.abs(foot[2]-knee[2])<.12,`foot at ${foot.map(x=>x.toFixed(3))}`);
 // Only the right leg kicks.
 const kick=[[SEATED.hip,SEATED.knee-KICK],[SEATED.hip,SEATED.knee]] as [[number,number],[number,number]];
 assert.ok(poseLeg(j.right.ankle,j,kick)[2]>foot[2]+.15);
 const left=poseLeg(j.left.ankle,j,seat);assert.deepEqual(poseLeg(j.left.ankle,j,kick),left);
});
