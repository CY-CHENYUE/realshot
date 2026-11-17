import test from 'node:test';
import assert from 'node:assert/strict';
import {defenseOutput} from '../src/defense-output.mjs';
import {DefenseGame,traceProtector} from '../src/defense-core.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('the same complete CAD aperture maps to 16:10 and 16:9 rasters without a second internal crop',()=>{
 for(const[w,h]of[[1680,1050],[1280,720],[1920,1080]]){
  const o=defenseOutput(w,h,'box');near(o.aspect,195/146.000001);near(o.logicalWidth*o.scaleX,w);near(o.logicalHeight,h);assert.equal(o.left,0);assert.equal(o.top,0);
  for(const u of[0,.25,.7,1])near((u*o.logicalWidth)*o.scaleX,w*u);
 }
 near(defenseOutput(1680,1050,'box').scaleX,1680/(1050*195/146.000001));
 assert.equal(defenseOutput(1680,1050).aspect,1.6);
});

test('ordinary-monitor preview preserves the physical aperture ratio with complete centred extent',()=>{
 for(const[w,h]of[[1680,1050],[760,1000]]){
  const o=defenseOutput(w,h,'box-preview');near(o.scaleX,1);near(o.logicalWidth/o.logicalHeight,195/146.000001);near(o.left*2+o.logicalWidth,w);near(o.top*2+o.logicalHeight,h);assert.ok(o.left>=-1e-8&&o.top>=-1e-8);
 }
 assert.throws(()=>defenseOutput(0,1050,'box'),RangeError);assert.throws(()=>defenseOutput(1680,1050,'bogus'),RangeError);
});

test('a hidden digital protector cannot leave an invisible friendly-fire blocker in physical-prop mode',()=>{
 const rules={protectorBlocksShots:false,groundEnabled:false};
 assert.equal(traceProtector([0,1,7],[0,1,-20],rules),null);
 assert.ok(traceProtector([0,1,7],[0,1,-20],{groundEnabled:false}));
 const g=new DefenseGame({rules,spawns:[{at:60,position:[4,1,-20]}]});g.fire({origin:[0,1,7],direction:[0,0,-1]});const e=g.advance(.9);assert.ok(e.some(x=>x.type==='miss'));assert.ok(!e.some(x=>x.type==='blocked'));assert.equal(g.protectedHP,100);
});
