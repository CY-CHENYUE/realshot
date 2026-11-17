import test from 'node:test';
import assert from 'node:assert/strict';
import {DefenseGame,DEFENSE_RULES,traceProtector,traceEnemy} from '../src/defense-core.mjs';

const industrial={groundEnabled:false,protectorHalfExtents:[.60,.69,.41],enemyHalfExtents:[.76,.41,.76]};
const stationary=(position,extra={})=>({at:0,position,speed:0,spawnDuration:0,...extra});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('shared protector helper catches the real cassette corner missed by the legacy sphere',()=>{
 const start=[.56,1.64,4],end=[.56,1.64,-4];
 assert.equal(traceProtector(start,end),null,'historical sphere has no such corner');
 const hit=traceProtector(start,end,{...DEFENSE_RULES,...industrial});
 assert.equal(hit.shape,'aabb');near(hit.position[2],.41);assert.deepEqual(hit.normal,[0,0,1]);
 const swept=traceProtector(start,end,{...DEFENSE_RULES,...industrial},.025);
 near(swept.position[2],.41);near(swept.center[2],.435);assert.ok(swept.t<hit.t);
});

test('the new cassette corner blocks a real simulated shot before a far enemy',()=>{
 const g=new DefenseGame({rules:{...industrial,projectileSpeed:3000},spawns:[stationary([.56,1.64,-3])]});
 g.advance(1/120);g.fire({origin:[.56,1.64,4],direction:[0,0,-1]});const events=g.advance(1/120);
 assert.ok(events.some(e=>e.type==='blocked'));assert.ok(!events.some(e=>e.type==='hit'));assert.equal(g.enemies[0].hp,2);assert.equal(g.protectedHP,100);
});

test('cassette proxy has finite edges rather than becoming a full invisible wall',()=>{
 const rules={...DEFENSE_RULES,...industrial};
 assert.equal(traceProtector([.64,1.64,4],[.64,1.64,-4],rules,.025),null);
 assert.equal(traceProtector([0,1.74,4],[0,1.74,-4],rules,.025),null);
 assert.ok(traceProtector([.60,1.69,4],[.60,1.69,-4],rules));
});

test('enemy side wing inside the real yaw envelope can be aimed at and hit',()=>{
 const enemy={x:2,y:1.05,z:-2},start=[2.62,1.05,4],end=[2.62,1.05,-4],rules={...DEFENSE_RULES,...industrial};
 assert.equal(traceEnemy(start,end,enemy),null);
 const aim=traceEnemy(start,end,enemy,rules);assert.equal(aim.shape,'aabb');near(aim.position[2],-1.24);
 const g=new DefenseGame({rules:{...industrial,projectileSpeed:3000},spawns:[stationary([2,1.05,-2])]});g.advance(1/120);g.fire({origin:start,direction:[0,0,-1]});
 assert.ok(g.advance(1/120).some(e=>e.type==='hit'));assert.equal(g.enemies[0].hp,1);
});

test('enemy proxy does not restore the old tall sphere or hit outside its horizontal envelope',()=>{
 const e={x:2,y:1.05,z:-2},r={...DEFENSE_RULES,...industrial};
 assert.equal(traceEnemy([2.80,1.05,4],[2.80,1.05,-4],e,r,.025),null);
 assert.equal(traceEnemy([2,1.50,4],[2,1.50,-4],e,r,.025),null);
 assert.ok(traceEnemy([2.74,1.05,4],[2.74,1.05,-4],e,r,.025));
});

test('moving AABB helper and simulation sweep translation instead of tunnelling across endpoints',()=>{
 const rules={...DEFENSE_RULES,...industrial},e={x:1,y:1.05,z:-2};
 assert.equal(traceEnemy([0,1.05,-1.8],[0,1.05,-2.175],e,rules,.025),null,'instantaneous aim sees the new center only');
 assert.ok(traceEnemy([0,1.05,-1.8],[0,1.05,-2.175],e,rules,.025,[-1,1.05,-2]),'simulation supplies the previous center');
 const g=new DefenseGame({rules:industrial,spawns:[{at:0,path:[[-1,-2],[1,-2]],speed:240,hp:1,spawnDuration:0}]});
 g.fire({origin:[0,1.05,-1.8],direction:[0,0,-1]});assert.ok(g.advance(1/120).some(e=>e.type==='kill'));
});

test('protector wins exact collision ties with a body at the same proxy center',()=>{
 const g=new DefenseGame({rules:{...industrial,enemyHalfExtents:industrial.protectorHalfExtents},spawns:[stationary([0,1,0])]});
 g.advance(1/120);g.fire({origin:[0,1,4],direction:[0,0,-1]});const events=g.advance(.2);
 assert.ok(events.some(e=>e.type==='blocked'));assert.ok(!events.some(e=>e.type==='hit'));assert.equal(g.enemies[0].hp,2);
});

test('omitting half extents keeps sphere hit distances and legacy corner misses unchanged',()=>{
 const p=traceProtector([0,1,5],[0,1,-5]);assert.equal(p.shape,'sphere');near(p.t,(5-DEFENSE_RULES.protectorRadius)/10);
 const e=traceEnemy([2,1,5],[2,1,-5],{x:2,y:1,z:0});assert.equal(e.shape,'sphere');near(e.t,(5-DEFENSE_RULES.enemyRadius)/10);
 const g=new DefenseGame({rules:{groundEnabled:false},spawns:[stationary([2,1.05,-2])]});g.advance(1/120);g.fire({origin:[2.62,1.05,4],direction:[0,0,-1]});assert.ok(!g.advance(.3).some(e=>e.type==='hit'));assert.equal(g.enemies[0].hp,2);
});

test('half extent input is owned and malformed optional geometry fails explicitly',()=>{
 const p=[.6,.69,.41],e=[.76,.41,.76],g=new DefenseGame({rules:{protectorHalfExtents:p,enemyHalfExtents:e}});p[0]=99;e[1]=99;
 assert.deepEqual(g.rules.protectorHalfExtents,[.6,.69,.41]);assert.deepEqual(g.rules.enemyHalfExtents,[.76,.41,.76]);
 for(const value of[[1,0,1],[1,-1,1],[1,NaN,1],[1,1]])assert.throws(()=>new DefenseGame({rules:{enemyHalfExtents:value}}),/positive half extents/);
 assert.throws(()=>traceProtector([0,1,3],[0,1,-3],{protectorHalfExtents:[1,0,1]}),/positive half extents/);
});
