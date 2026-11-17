import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createSideDepthBaysR17} from '../src/defense-side-depth-bays-r17.mjs';

function camera(){const c=new T.PerspectiveCamera(55,195/146,.01,100);c.updateMatrixWorld();return c;}
test('r17 side sectors move toward the front and expose projected scale metadata',()=>{
 const layer=createSideDepthBaysR17({camera:camera()});layer.update(0,{wave:1});const first=layer.inspection();
 assert.equal(first.id,'virtual-side-depth-bays-r17');assert.equal(first.finiteProxyCount,0);assert.equal(first.sector.length,6);assert.equal(first.centralOpening.open,true);
 const y0=first.sector[0].y,uv0=first.sector[0].projected;layer.update(4,{wave:1});const mid=layer.inspection();assert.ok(mid.sector[0].y<y0);assert.ok(mid.travelDistance>0);assert.ok(mid.sector[0].projected);
 assert.notDeepEqual(mid.sector[0].projected,uv0);
});
test('r17 recirculates after the front boundary and freezes while paused',()=>{
 const layer=createSideDepthBaysR17({camera:camera()});layer.update(0,{wave:2});layer.update(34,{wave:2});const moving=layer.inspection();assert.ok(moving.sector.some(s=>s.y>500),'at least one sector should have returned to far depth');
 const before=JSON.stringify(moving.sector);layer.update(40,{wave:2,paused:true});assert.equal(JSON.stringify(layer.inspection().sector),before);
});
test('r17 transitions facility variants smoothly every nine seconds',()=>{
 const layer=createSideDepthBaysR17({camera:camera()});layer.update(9,{wave:1});const a=layer.inspection();layer.update(9.6,{wave:1});const b=layer.inspection();layer.update(10.8,{wave:1});const c=layer.inspection();
 assert.ok(a.transition.some(t=>t.progress===0));assert.ok(b.transition.some(t=>t.progress>0&&t.progress<1));assert.ok(c.transition.some(t=>t.progress===1));
 assert.ok(b.dynamic.transitionSeconds>0&&b.dynamic.sectorPeriodSeconds>=8&&b.dynamic.sectorPeriodSeconds<=10);
});
