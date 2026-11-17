import * as T from 'three';
import {CrowdView,loadCrowdModels,CROWD_KINDS,gaitCycle} from './level-crowd.mjs';
// RealShot r26 · inspection page for the generated soldiers (dev-crowd.html). Not part of the game.
// ?lod=0|1|2 forces a level of detail, ?view=front|back|side|close, ?kind=<one kind>, ?t=<seconds> freezes the time.
const q=new URLSearchParams(location.search),canvas=document.getElementById('c');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight,false);
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.background=new T.Color('#5b6b7c');
const sun=new T.DirectionalLight('#fff1dd',3.2);sun.position.set(-4,7,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:6,bottom:-4,near:.5,far:30});sun.shadow.bias=-.0004;scene.add(sun);
scene.add(new T.HemisphereLight('#9fc0ea','#8a8f96',.9));
const ground=new T.Mesh(new T.PlaneGeometry(60,60),new T.MeshStandardMaterial({color:'#dfe6ec',roughness:.9}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const pm=new T.PMREMGenerator(renderer),envScene=new T.Scene();envScene.background=new T.Color('#8aa4c4');scene.environment=pm.fromScene(envScene).texture;scene.environmentIntensity=.6;
const camera=new T.PerspectiveCamera(32,innerWidth/innerHeight,.1,200);
const crowd=new CrowdView(scene,{alive:60,bodies:20});
const models=await loadCrowdModels();crowd.useModels(models);crowd.forceLod=q.has('lod')?Number(q.get('lod')):-1;
const kinds=q.get('kind')?[q.get('kind')]:CROWD_KINDS,scale={trooper:1,brute:1.42,bomber:.92};
// per kind: rest, run (two phases), attack, stagger, rising
const states=[['run',0,0],['run',2.2,.35],['run',2.2,1.1],['attack',0,0],['stagger',0,0],['rise',0,0]];
const members=[];let id=1;
kinds.forEach((kind,row)=>states.forEach(([state,v,phase],col)=>members.push({id:id++,kind,x:(col-(states.length-1)/2)*(kinds.length>1?2.3:1.9),y:0,z:-row*3.2,vx:0,vz:v,phase,yaw:0,scale:scale[kind],state,hitAt:-9,bornAt:-.55,riseDur:1,attackAt:-.2})));
// ?strip=<n>: one kind running, n soldiers a step apart in the cycle (a stride sheet); ?v=<m/s> sets the speed
if(q.has('strip')){members.length=0;const n=Number(q.get('strip'))||8,kind=kinds[0],v=Number(q.get('v')??{trooper:4,brute:2.7,bomber:5.8}[kind]),gap=Number(q.get('gap')??1.5);
 for(let i=0;i<n;i++)members.push({id:id++,kind,x:(i-(n-1)/2)*gap*scale[kind],y:0,z:0,vx:0,vz:v,phase:(i/n+Number(q.get('p')??0))*gaitCycle(kind)*scale[kind],yaw:0,scale:scale[kind],state:'run',hitAt:-9,bornAt:-.55,riseDur:1,attackAt:-.2});}
crowd.gaitFromRules=true;
const view=q.get('view')??'front',yaw={front:0,back:Math.PI,side:Math.PI/2,close:0,three:.6}[view]??0;
for(const m of members)m.yaw=yaw;
if(view==='close'){camera.fov=30;camera.position.set(.2,1.45,3.3);camera.lookAt(0,1.15,0);for(const m of members)m.x=m.x*.62;}
else if(kinds.length===1){camera.position.set(0,1.6,13.5);camera.lookAt(0,1.1,0);}
else{camera.position.set(0,4.6,15.5);camera.lookAt(0,1.0,-3.2);}
if(q.has('cam')){const c=q.get('cam').split(',').map(Number);camera.position.set(c[0],c[1],c[2]);camera.lookAt(c[3]??0,c[4]??1,c[5]??0);if(c[6])camera.fov=c[6];}
camera.updateProjectionMatrix();
const fixed=q.has('t')?Number(q.get('t')):null,start=performance.now();
function frame(){const t=fixed??(performance.now()-start)/1000;crowd.update(0,t,members,()=>0,camera.position);renderer.render(scene,camera);requestAnimationFrame(frame);}
frame();window.devCrowd={crowd,models,members,renderer,camera,ready:true};
