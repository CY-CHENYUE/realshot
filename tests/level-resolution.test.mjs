import test from 'node:test';
import assert from 'node:assert/strict';
import {ResolutionGovernor,RESOLUTION_STEPS} from '../src/level-resolution.mjs';

// feed `seconds` of frames whose interval comes from dt(i); collect level changes
function run(g,seconds,dt){const changes=[];let t=0,i=0;while(t<seconds*1000){const d=dt(i++);t+=d;const s=g.frame(d);if(s!==null)changes.push(s);}return changes;}
const smooth=()=>16.7,alternating=i=>i%2?33.3:16.7;

test('a smooth 60 fps run never leaves full resolution',()=>{
 const g=new ResolutionGovernor();assert.deepEqual(run(g,30,smooth),[]);assert.equal(g.scale,1);
 // 120 Hz panels: 8.3 ms frames are fast, not slow
 assert.deepEqual(run(g,10,()=>8.3),[]);
});

test('a frame rate stuck at 30-60 steps down one level at a time and stops at the floor',()=>{
 const g=new ResolutionGovernor();
 const first=run(g,5,alternating);assert.deepEqual(first,[RESOLUTION_STEPS[1]]);
 run(g,30,alternating);assert.equal(g.scale,RESOLUTION_STEPS.at(-1));
 assert.equal(g.changes,RESOLUTION_STEPS.length-1);
});

test('after a clean stretch it tries one step up and keeps it when frames stay smooth',()=>{
 const g=new ResolutionGovernor();run(g,5,alternating);assert.equal(g.level,1);
 assert.deepEqual(run(g,7,smooth),[],'no trial before the clean stretch');
 const up=run(g,6,smooth);assert.deepEqual(up,[1]);assert.equal(g.level,0);
 run(g,6,smooth);assert.equal(g.inspection().trial,false);assert.equal(g.level,0);
});

test('a trial that brings misses back is undone and the next trial waits twice as long',()=>{
 const g=new ResolutionGovernor();run(g,5,alternating);assert.equal(g.level,1);
 // GPU cost sits between the two levels: smooth at .9, missing at 1.0
 const dt=i=>g.level===0?(i%10<3?33.3:16.7):16.7;
 const changes=run(g,60,dt);
 assert.ok(changes.length>=2&&changes.length<=6,`settles instead of oscillating (${changes})`);
 assert.ok(g.inspection().backoff>=16);
});

test('stalls, tab switches and invalid intervals are not counted',()=>{
 const g=new ResolutionGovernor();
 const dt=i=>i%120===60?900:i%120===61?0:16.7;
 assert.deepEqual(run(g,20,dt),[]);
 for(const bad of [NaN,-5,Infinity])assert.equal(g.frame(bad),null);
});

test('hold restarts the measurement without changing level',()=>{
 const g=new ResolutionGovernor();run(g,5,alternating);const level=g.level;
 g.hold();assert.equal(g.level,level);
 assert.deepEqual(run(g,1,alternating),[],'no decision until a full window after hold');
});
