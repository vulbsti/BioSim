import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advance,applyAction,createBody} from '../app/simulation/engine';
import {materialize,nearest,record,truncate,TIMELINE,type Snapshot} from '../app/simulation/timeline';
import {markedTotal} from '../app/simulation/transport';
import type {BodyState} from '../app/simulation/types';

const meal={carbs:60,protein:20,fat:15,water:250,sodium:500};
/** A run recorded the way the worker records it. */
const run=(seconds:number,timeline:Snapshot[],s=createBody())=>{if(!timeline.length)record(timeline,s);for(let left=seconds;left>0;left-=TIMELINE.interval){advance(s,Math.min(left,TIMELINE.interval));record(timeline,s);}return s;};

test('an earlier moment comes back exactly as it was, and the present is untouched',()=>{
 const timeline:Snapshot[]=[],s=createBody();record(timeline,s);applyAction(s,{kind:'meal',meal});record(timeline,s,true);
 run(900,timeline,s);const then=structuredClone(s);run(2700,timeline,s);const now=structuredClone(s);
 assert.deepEqual(timeline.map(t=>t.time).slice(0,3),[0,30,60]);assert.equal(timeline.at(-1)!.time,3600);
 const back=materialize(timeline[nearest(timeline,900)],s);
 assert.deepEqual(back,then);assert.deepEqual(s,now);
 // The meal's label is part of the state, so looking back shows where the meal was then.
 assert.ok(back.transport.mark.pools.stomach.glucose>s.transport.mark.pools.stomach.glucose&&Math.abs(markedTotal(back).glucose-60)<1e-9);
 // Looking back hands out copies: changing one changes neither the snapshot nor the run.
 back.glycogen=0;back.history.length=0;assert.deepEqual(materialize(timeline[nearest(timeline,900)],s),then);
});

test('continuing from an earlier moment replays the same future',()=>{
 const timeline:Snapshot[]=[],s=createBody();record(timeline,s);applyAction(s,{kind:'meal',meal});record(timeline,s,true);
 run(1800,timeline,s);const future=structuredClone(s);
 let again=materialize(timeline[nearest(timeline,600)],s);truncate(timeline,again.time);
 assert.equal(timeline.at(-1)!.time,600);assert.equal(again.time,600);
 again=run(1200,timeline,again);assert.deepEqual(again,future);
 // A different choice from the same moment gives a different future, and only that future is kept.
 const other=materialize(timeline[nearest(timeline,600)],again);truncate(timeline,600);applyAction(other,{kind:'environment',values:{exercise:.6}});record(timeline,other,true);
 run(1200,timeline,other);assert.ok(other.heartRate>future.heartRate+20);assert.equal(timeline.filter(t=>t.time===600).length,1);
 assert.equal(materialize(timeline[nearest(timeline,600)],other).inputs.exercise,.6);
});

test('the nearest moment is chosen, a meal at the same second replaces its snapshot, and long runs stay bounded',()=>{
 const timeline:Snapshot[]=[],s=createBody();run(300,timeline,s);
 assert.deepEqual([nearest(timeline,-5),nearest(timeline,44),nearest(timeline,46),nearest(timeline,1e9)].map(i=>timeline[i].time),[0,30,60,300]);
 const count=timeline.length;applyAction(s,{kind:'meal',meal});record(timeline,s,true);
 assert.equal(timeline.length,count);assert.equal(timeline.at(-1)!.state.stomach.carbs,60);
 // Between snapshots nothing is recorded unless forced.
 advance(s,10);record(timeline,s);assert.equal(timeline.length,count);
 // Thinning keeps the first moment, recent detail, and a fixed ceiling.
 const long:Snapshot[]=[],state={...createBody()} as BodyState;
 for(let t=0;t<=TIMELINE.interval*3000;t+=TIMELINE.interval){state.time=t;record(long,state);assert.ok(long.length<=TIMELINE.limit);}
 assert.equal(long[0].time,0);assert.equal(long.at(-1)!.time,TIMELINE.interval*3000);assert.equal(long.at(-1)!.time-long.at(-2)!.time,TIMELINE.interval);
 assert.ok(long.every((t,i)=>i===0||t.time>long[i-1].time)&&long[2].time-long[1].time>TIMELINE.interval);
 // A snapshot carries no plotted history or receipts of its own.
 assert.deepEqual([timeline[3].state.history.length,timeline[3].state.receipts.length],[0,0]);
});
