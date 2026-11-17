import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {prepareEnemyDamageParts} from '../src/enemy-damage-parts.mjs';
import {createEnemyDamageSystem} from '../src/enemy-damage.mjs';
import {createIndustrialScene} from '../src/defense-industrial-scene.mjs';
import {traceScenery} from '../src/defense-core.mjs';

test('authored armour keeps its geometry and transforms when detaching from a transformed actor',()=>{
 const root=new T.Group(),group=new T.Group(),hull=new T.Group(),model=new T.Group();
 root.add(group);group.add(hull);hull.add(model);group.position.set(2,1.4,-3);group.rotation.y=.6;model.scale.setScalar(.85);
 const material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry(.6,.08,.4),part=new T.Mesh(geometry,material);part.name='DamageArmour_Fore';part.position.set(.1,.2,.3);part.rotation.z=.12;model.add(part);
 const authored=prepareEnemyDamageParts(model),actor={id:1,group,hull,model,data:{x:2,y:1.4,z:-3,hp:4,maxHP:4},rotors:[],ownedMaterials:[material]},system=createEnemyDamageSystem({root});
 try{
  assert.equal(authored.authored,true);assert.equal(authored.parts.length,1);assert.equal(part.geometry,geometry);
  const state=system.register(actor);root.updateMatrixWorld(true);
  const vertex=new T.Vector3().fromBufferAttribute(geometry.attributes.position,0),before=part.localToWorld(vertex.clone());
  system.queue(1,{type:'hit',time:1,hp:2,maxHP:4,projectileId:5,position:before.toArray(),direction:[0,0,-1],normal:[0,0,1]});
  system.updateActor(state,1,1/60);system.updateDebris(1);root.updateMatrixWorld(true);
  assert.equal(system.inspection().damageDebris.length,1);assert.equal(part.geometry,geometry);
  assert.ok(part.localToWorld(vertex.clone()).distanceTo(before)<1e-6,'detachment preserves the real panel in world space');
  assert.notEqual(part.material,material,'debris fade does not fade intact body material');
  system.updateDebris(4);assert.equal(system.inspection().damageDebris.length,0);
 }finally{system.dispose();geometry.dispose();material.dispose();}
});

test('industrial open bay and four attack approaches are empty in both visible geometry and collision proxies',()=>{
 const h=createIndustrialScene();h.root.updateMatrixWorld(true);
 const paths=[[[0,1.65,7.8],[0,1,0]],[[0,.6,4.9],[0,.6,-8.1]],[[6.1,1.05,-1.8],[3.1,1.05,-1.8]],[[-6.1,1.05,-.6],[-3.1,1.05,-.6]],[[0,1.45,-10.55],[0,1.45,-12.5]],[[2.3,1.45,-3.8],[1.05,1.45,3.45]]];
 try{for(const[a,b]of paths){
  const origin=new T.Vector3(...a),delta=new T.Vector3(...b).sub(origin);
  assert.equal(new T.Raycaster(origin,delta.clone().normalize(),1e-5,delta.length()).intersectObject(h.root,true).length,0,`visible passage ${a}`);
  assert.equal(traceScenery(a,b,h.collisionBoxes),null,`gameplay passage ${a}`);
 }}finally{h.dispose();}
});
