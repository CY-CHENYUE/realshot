import test from 'node:test';import assert from 'node:assert/strict';
import {WeaponFeedback} from '../src/feedback.mjs';
test('automatic fire remains bounded and settles after firing stops',()=>{
 const f=new WeaponFeedback();
 for(let n=0;n<18;n++){f.shoot(false);for(let i=0;i<9;i++){f.update(.14/9);for(const key of ['z','pitch','roll'])assert.ok(Number.isFinite(f[key]));assert.ok(Math.abs(f.z)<.09);assert.ok(Math.abs(f.pitch)<.13);}}
 assert.equal(f.count,18);for(let n=0;n<180;n++)f.update(1/60);assert.ok(Math.abs(f.z)<.00001);assert.ok(Math.abs(f.pitch)<.00001);assert.ok(Math.abs(f.roll)<.00001);
});
test('aimed response is restrained and frame-rate changes do not create divergent recoil',()=>{
 const hip=new WeaponFeedback(),ads=new WeaponFeedback();hip.shoot();ads.shoot(true);hip.update(.04);ads.update(.04);assert.ok(ads.z<hip.z*.6);
 const slow=new WeaponFeedback(),fast=new WeaponFeedback();slow.shoot();fast.shoot();for(let n=0;n<6;n++)slow.update(1/20);for(let n=0;n<36;n++)fast.update(1/120);assert.ok(Math.abs(slow.z-fast.z)<.002);assert.ok(Math.abs(slow.pitch-fast.pitch)<.002);
});
