import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {applyCombatAppearance,combatCue} from '../src/combat-appearance.mjs';
import {createDefenseWorldV3} from '../src/defense-world-v3.mjs';

test('role finish separates enemy and protector while preserving physical maps and geometry',()=>{
 const map=new T.Texture(),normal=new T.Texture(),roughness=new T.Texture(),geometry=new T.BoxGeometry();
 const material=new T.MeshStandardMaterial({name:'Industrial_SlateCoat',map,normalMap:normal,roughnessMap:roughness,metalness:1});
 const model=new T.Group(),mesh=new T.Mesh(geometry,material);model.add(mesh);const position=geometry.attributes.position,index=geometry.index;
 try{
  applyCombatAppearance(model,'enemy');const enemy=material.color.clone();
  const sourceSample=new T.Color().setRGB(.15,.205,.215).convertSRGBToLinear(),shadedAlbedo=sourceSample.clone().multiply(material.color),expected=new T.Color('#ba5437');
  assert.ok(Math.hypot(shadedAlbedo.r-expected.r,shadedAlbedo.g-expected.g,shadedAlbedo.b-expected.b)<1e-6,'decoded sRGB albedo times tint reaches intended working-linear finish');
  assert.ok(shadedAlbedo.r>shadedAlbedo.g&&shadedAlbedo.r>shadedAlbedo.b,'sampled enemy paint has warm colour identity');
  assert.equal(mesh.geometry,geometry);assert.equal(geometry.attributes.position,position);assert.equal(geometry.index,index);
  assert.equal(material.map,map);assert.equal(material.normalMap,normal);assert.equal(material.roughnessMap,roughness);
  const other=material.clone(),protectedModel=new T.Group();other.color.set('white');other.metalness=1;protectedModel.add(new T.Mesh(geometry,other));
  applyCombatAppearance(protectedModel,'protector');const protectedAlbedo=sourceSample.clone().multiply(other.color);assert.ok(protectedAlbedo.b>protectedAlbedo.r&&protectedAlbedo.g>protectedAlbedo.r,'sampled protected device has a cool identity');assert.ok(Math.hypot(protectedAlbedo.r-shadedAlbedo.r,protectedAlbedo.g-shadedAlbedo.g,protectedAlbedo.b-shadedAlbedo.b)>.3);other.dispose();
 }finally{geometry.dispose();material.dispose();map.dispose();normal.dispose();roughness.dispose();}
});

test('entry and attack cues remain bounded and seek safely across pause, death and restart',()=>{
 assert.equal(combatCue(4,4).scale,1);
 assert.equal(combatCue(4.3,4).entry,true);assert.deepEqual(combatCue(4.3,4),combatCue(4.3,4),'paused time is deterministic');
 assert.equal(combatCue(4.9,4).entry,false);assert.equal(combatCue(8,4,.7).attack,true);assert.equal(combatCue(8,4,1,true).attack,false);
 assert.equal(combatCue(0,4).entry,false);assert.equal(combatCue(.1,0).entry,true);assert.ok(combatCue(.1,0).entryOpacity<=.7);
});

test('a stunned enemy holds its approach heading instead of snapping toward the core',()=>{
 const world=createDefenseWorldV3({environment:'industrial'}),e={id:1,x:1.4,y:1.45,z:1.5,hp:4,maxHP:4,state:'moving',spawnedAt:0,previous:[1.405,1.45,1.48]};
 try{
  world.update(1,{enemies:[e]});const actor=world.enemyMeshes.get(1),heading=actor.heading;
  world.update(1.1,{enemies:[{...e,state:'stunned',previous:[e.x,e.y,e.z]}]});
  assert.equal(actor.heading,heading,'logical stopping cannot cause an unrelated turn');assert.equal(actor.group.scale.x,1);
  world.update(1.2,{enemies:[{...e,state:'windup',attackProgress:.6}]});assert.notEqual(actor.heading,heading,'an actual attack may face the protected target');
 }finally{world.dispose();}
});
