import * as T from 'three';
import {PropField,loadPropModels,PROP_KINDS,PROPS} from './level-props.mjs';
// RealShot r26 · inspection page for the generated props (dev-props.html). Not part of the game.
// ?lod=0|1|2 forces a level of detail, ?boxes=1 draws the collision boxes, ?kind=<one kind> (close view),
// ?yaw=<degrees> turns every prop, ?lamp=<0..1> lights the floodlights, ?view=top
const q=new URLSearchParams(location.search),canvas=document.getElementById('c');
const renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight,false);
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
const scene=new T.Scene();scene.background=new T.Color(q.has('lamp')?'#10141c':'#5b6b7c');
const sun=new T.DirectionalLight('#fff1dd',q.has('lamp')?.25:3.2);sun.position.set(-8,14,10);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-24,right:24,top:20,bottom:-12,near:.5,far:60});sun.shadow.bias=-.0004;scene.add(sun);
scene.add(new T.HemisphereLight('#9fc0ea','#8a8f96',q.has('lamp')?.2:.9));
const ground=new T.Mesh(new T.PlaneGeometry(120,120),new T.MeshStandardMaterial({color:'#dfe6ec',roughness:.9}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const pm=new T.PMREMGenerator(renderer),envScene=new T.Scene();envScene.background=new T.Color('#8aa4c4');scene.environment=pm.fromScene(envScene).texture;scene.environmentIntensity=q.has('lamp')?.1:.6;
const camera=new T.PerspectiveCamera(30,innerWidth/innerHeight,.1,300);
const kinds=q.get('kind')?[q.get('kind')]:PROP_KINDS,models=await loadPropModels('/assets/props/',kinds),yaw=Number(q.get('yaw'))||0;
// two rows: small props in front, large ones behind
const small=kinds.filter(k=>models[k].meta.height<2),large=kinds.filter(k=>models[k].meta.height>=2);
const layout=[];let x=-(small.length-1)*2;for(const k of small){layout.push([k,0,x,yaw]);x+=4;}x=-(large.length-1)*3.4;for(const k of large){layout.push([k,8,x,yaw]);x+=6.8;}
const field=new PropField(scene,models,{layout,place:(S,x)=>[x,0,-S]});field.forceLod=q.has('lod')?Number(q.get('lod')):-1;
if(q.get('boxes')==='1')for(const b of field.live)scene.add(new T.Box3Helper(new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)),b.explosive?'#ff3020':'#30ff60'));
if(kinds.length===1){const h=models[kinds[0]].meta.height;camera.position.set(h*1.1,h*.75,h*2.1+1.5);camera.lookAt(0,h*.45,0);}
else if(q.get('view')==='top'){camera.position.set(0,46,-3.9);camera.lookAt(0,0,-4);}
else{camera.position.set(0,9.5,27);camera.lookAt(0,2.6,-3);}
camera.updateProjectionMatrix();
function frame(){field.update(performance.now()/1000,camera.position,Number(q.get('lamp'))||0);renderer.render(scene,camera);requestAnimationFrame(frame);}
frame();window.devProps={field,models,renderer,ready:true};
