import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createOpenDepthScene} from '../src/defense-open-depth-scene.mjs';
import {createIndustrialScene} from '../src/defense-industrial-scene.mjs';
import {traceScenery} from '../src/defense-core.mjs';
const withScene=fn=>{const s=createOpenDepthScene();try{fn(s);}finally{s.dispose();}};
function hit(scene,start,end){const a=new T.Vector3(...start),v=new T.Vector3(...end).sub(a);return new T.Raycaster(a,v.clone().normalize(),.0001,v.length()).intersectObject(scene.root,true)[0];}
const camera=()=>{const c=new T.PerspectiveCamera(60.469140346345995,1.6,.06,160);c.position.set(0,1.65,7.8);c.lookAt(0,1.15,-1.8);c.updateMatrixWorld(true);return c;};

test('all four default enemy approaches and central hero volume stay open in actual geometry and proxy',()=>withScene(s=>{
 const paths=[[[0,1.65,7.8],[0,1,0]],[[6.1,1.05,-1.8],[1.35,1.05,.4]],[[-6.1,1.05,-.6],[-1.35,1.05,.4]],[[3.1,1.05,-6.8],[1.4,1.05,-.05]],[[-3.1,1.05,-6.8],[-1.4,1.05,-.05]],[[2.35,1.05,3.9],[.55,1.05,1.3]],[[-2.35,1.05,3.9],[-.55,1.05,1.3]]];
 for(const[a,b]of paths){assert.ok(!hit(s,a,b),`visible approach ${a}`);assert.equal(traceScenery(a,b,s.collisionBoxes,.025),null,`proxy approach ${a}`);}
 for(let x=-3.3;x<=3.3;x+=.33)for(const y of[.25,1.05,1.8,3.6]){assert.ok(!hit(s,[x,y,5],[x,y,-12]));assert.equal(traceScenery([x,y,5],[x,y,-12],s.collisionBoxes,.025),null);}
}));

test('full 12m by 4.4m pressure gate is air, with no enclosing proxy or centre floor',()=>withScene(s=>{
 const gate=s.inspection().gate;assert.equal(gate.width,12);assert.equal(gate.height,4.4);
 for(let x=-5.7;x<=5.7;x+=.57)for(let y=.16;y<4.3;y+=.41){assert.ok(!hit(s,[x,y,-11],[x,y,-12]));assert.equal(traceScenery([x,y,-11],[x,y,-12],s.collisionBoxes),null);}
 assert.ok(!hit(s,[0,1,1],[0,-3,1]));assert.equal(traceScenery([0,1,1],[0,-3,1],s.collisionBoxes),null);assert.equal(s.inspection().hiddenFloor,false);assert.equal(s.inspection().nearDiagonalBeams,false);
}));

test('formal field of view exposes broad background instead of mostly foreground beam/deck',()=>withScene(s=>{
 const c=camera(),ray=new T.Raycaster();let total=0,occluded=0,foreground=0;
 for(let x=-.80;x<=.8;x+=.08)for(let y=-.55;y<=.55;y+=.08){ray.setFromCamera(new T.Vector2(x,y),c);const v=ray.intersectObject(s.root,true)[0];total++;if(v){occluded++;if(v.distance<10)foreground++;}}
 assert.ok(occluded/total<.16,'the middle field stays predominantly actual empty air');assert.ok(foreground/total<.025,'close structural surfaces no longer occupy the middle view');
 const old=createIndustrialScene();try{let oldOccluded=0;for(let x=-.80;x<=.8;x+=.08)for(let y=-.55;y<=.55;y+=.08){ray.setFromCamera(new T.Vector2(x,y),c);if(ray.intersectObject(old.root,true)[0])oldOccluded++;}assert.ok(occluded<oldOccluded*.60,'new structure actually clears the rejected old central view');}finally{old.dispose();}
 const left=new T.Vector3(-6,2.2,-11.55).project(c),right=new T.Vector3(6,2.2,-11.55).project(c);assert.ok((right.x-left.x)*720>480,'wide gate spans more than 480 native pixels at 1440x900');
}));

test('actual service decks and gate posts stop rays at corresponding solid proxies',()=>withScene(s=>{
 const paths=[[[6.3,1,-5],[6.3,-1,-5]],[[6.085,2,-11],[6.085,2,-12]],[[6.89,2.7,-7],[6.89,2.7,-9]],[[0,4.485,-11],[0,4.485,-12]]];
 for(const[a,b]of paths){const actual=hit(s,a,b),rule=traceScenery(a,b,s.collisionBoxes);assert.ok(actual);assert.ok(rule);assert.equal(rule.colliderId,actual.object.name);assert.ok(actual.point.distanceTo(new T.Vector3(...rule.position))<.025,'small bevel volume tolerance is bounded');}
 for(const box of s.collisionBoxes)assert.ok(box.min.every((v,i)=>Number.isFinite(v)&&v<box.max[i]));
}));

test('shared PBR material ownership is respected; only new geometry/fallbacks are disposed',()=>{
 const borrowed=new T.MeshStandardMaterial({name:'provided coat'}),s=createOpenDepthScene({materials:{shell:borrowed}});let sharedDisposed=0,ownedDisposed=0;borrowed.addEventListener('dispose',()=>sharedDisposed++);s.root.traverse(o=>{if(o.isMesh&&o.material!==borrowed)o.material.addEventListener('dispose',()=>ownedDisposed++);});
 assert.ok(s.inspection().meshes<110);s.setDisplayMode('desktop');assert.equal(s.inspection().mode,'desktop');assert.throws(()=>s.setDisplayMode('bad'),RangeError);s.dispose();s.dispose();assert.equal(sharedDisposed,0);assert.ok(ownedDisposed>0);assert.equal(s.root.children.length,0);borrowed.dispose();
});
