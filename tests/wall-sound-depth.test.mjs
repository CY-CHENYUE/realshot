import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSound,wallImpactProfile} from '../src/sound.mjs';

test('far wall sound loses body and high frequencies without delaying the contact twice',()=>{
 const near=wallImpactProfile(3),far=wallImpactProfile(33);
 assert.ok(far.gain<near.gain*.5);assert.ok(far.cutoff<near.cutoff);assert.ok(far.reflectionDelay>near.reflectionDelay);
 const s=new GameSound(),voices=[],reflections=[];s.voice=(...args)=>voices.push(args);s.later=(...args)=>reflections.push(args);s.thump=()=>{};
 s.play('wallHit',{distance:33,x:.7});
 assert.equal(voices.length,2);assert.ok(voices.every(v=>v[4]===0),'primary contact starts only at the already-resolved arrival');
 assert.equal(reflections.length,1);assert.equal(reflections[0][0],far.reflectionDelay);
 assert.equal(s.lastWall.distance,33);assert.ok(voices.every(v=>v[5].cutoff===far.cutoff));
});
