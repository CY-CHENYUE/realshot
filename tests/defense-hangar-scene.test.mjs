import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createHangarScene} from '../src/defense-hangar-scene.mjs';import {traceScenery} from '../src/defense-core.mjs';

test('the real maintenance bay and attack corridors remain open in geometry and gameplay',()=>{
 const h=createHangarScene();h.root.updateMatrixWorld(true);
 try{for(const[a,b]of[[[0,1.65,7.8],[0,1,0]],[[0,1.05,4.9],[0,1.05,-8.1]],[[6.1,1.05,-1.8],[3.1,1.05,-1.8]],[[-6.1,1.05,-.6],[-3.1,1.05,-.6]],[[0,2.2,-10.55],[0,2.2,-12.5]]]){
  const o=new T.Vector3(...a),delta=new T.Vector3(...b).sub(o);assert.equal(new T.Raycaster(o,delta.clone().normalize(),1e-5,delta.length()).intersectObject(h.root,true).length,0,`actual opening ${a}`);assert.equal(traceScenery(a,b,h.collisionBoxes),null,`rule opening ${a}`);
 }}finally{h.dispose();}
});

test('bounded visible deck takes impacts; empty central bay cannot cast a fake floor shadow',()=>{
 const h=createHangarScene(),a=[-4.72,1,0],b=[-4.72,-1,0];h.root.updateMatrixWorld(true);
 try{const o=new T.Vector3(...a),d=new T.Vector3(...b).sub(o),hits=new T.Raycaster(o,d.clone().normalize(),0,d.length()).intersectObject(h.root,true);assert.ok(hits.length);const hit=traceScenery(a,b,h.collisionBoxes);assert.ok(hit);assert.ok(Math.abs(hit.position[1]-hits[0].point.y)<.04);let hiddenReceivers=0;h.root.traverse(x=>{if(x.isMesh&&x.material?.isShadowMaterial)hiddenReceivers++;});assert.equal(hiddenReceivers,0);assert.ok(h.collisionBoxes.length<400);
 }finally{h.dispose();}
});
