import * as T from 'three';
import {cloudGeometry,plumeMaterial} from './combat-burst.mjs';

const EPS=1e-8,UP=new T.Vector3(0,1,0),FORWARD=new T.Vector3(0,0,1);
const finite3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};

// A visible exposure segment of the real flight, not an offset/screen-space
// proxy. The caller renders it as a cylinder/capsule along head-tail. Its width
// stays in metres; perspective alone makes it shrink towards the impact plane.
export function tracerSegment(projectile,{exposure=.09,maxLength=4.5}={}){
 if(!finite3(projectile?.position)||!finite3(projectile?.origin)||!finite3(projectile?.direction))return null;
 const head=new T.Vector3(...projectile.position),origin=new T.Vector3(...projectile.origin),direction=new T.Vector3(...projectile.direction);
 if(direction.lengthSq()<EPS)return null;direction.normalize();
 const geometricDistance=head.distanceTo(origin),recordedDistance=Number.isFinite(projectile.distance)?Math.max(0,projectile.distance):geometricDistance;
 const travelled=Math.min(geometricDistance,recordedDistance),speed=finite3(projectile.velocity)?new T.Vector3(...projectile.velocity).length():45;
 const length=Math.min(Math.max(0,maxLength),speed*Math.max(0,exposure),travelled);
 const tail=head.clone().addScaledVector(direction,-length);
 return {head:head.toArray(),tail:tail.toArray(),length,radius:.009,width:.018,direction:direction.toArray(),travelled};
}

function scarGeometry(){
 const shape=new T.Shape(),count=13;
 for(let i=0;i<count;i++){const a=i/count*Math.PI*2,r=.030+hash(i*7+4)*.012,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();
 return new T.ShapeGeometry(shape);
}
function cavityGeometry(){
 const shape=new T.Shape(),points=[[-.018,-.008],[-.011,-.019],[.003,-.017],[.016,-.006],[.013,.010],[.001,.017],[-.015,.011]];
 points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();return new T.ShapeGeometry(shape);
}
function flakeGeometry(){
 // Only three uneven chipped lips, not a complete impact ring.
 const p=[-.028,-.018,.001,-.011,-.026,.001,-.017,-.009,.001, .015,.021,.001,.030,.010,.001,.011,.010,.001, -.025,.020,.001,-.013,.031,.001,-.013,.016,.001];
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}

function fixedImpressionGeometry(){
 const positions=[],colours=[];
 for(const [source,colour,z]of[[scarGeometry(),'#8b8b80',0],[cavityGeometry(),'#273032',.0008],[flakeGeometry(),'#b9b8aa',.0013]]){
  const geometry=source.index?source.toNonIndexed():source,attribute=geometry.attributes.position,c=new T.Color(colour);
  for(let i=0;i<attribute.count;i++){positions.push(attribute.getX(i),attribute.getY(i),attribute.getZ(i)+z);colours.push(c.r,c.g,c.b);}if(geometry!==source)geometry.dispose();source.dispose();
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colours,3));geometry.computeVertexNormals();return geometry;
}

// Grey wall contact only. Collision events supply the real plane, point and
// arrival time; range expiration or an open aperture never invents an impact.
export class WallImpactFX{
 constructor(scene,{maxMarks=28,maxBursts=10,maxChips=96}={}){
  this.scene=scene;this.maxMarks=Math.max(1,Math.floor(maxMarks));this.maxBursts=Math.max(1,Math.floor(maxBursts));this.maxChips=Math.max(1,Math.floor(maxChips));this.marks=[];this.active=[];this.chips=[];this.sequence=0;this.disposed=false;
  this.scar=fixedImpressionGeometry();this.chipGeometry=new T.TetrahedronGeometry(1,0);this.dustGeometry=cloudGeometry(3.1);
  const surface={depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:T.DoubleSide,toneMapped:false};
  // Finite opaque chipped faces retain their surface colour over the HDR
  // white panel; alpha blending here would lift the hole back to near-white.
  this.scarMaterial=new T.MeshBasicMaterial({...surface,vertexColors:true});
  this.chipMaterial=new T.MeshStandardMaterial({color:'#969b94',roughness:.88,metalness:0});this.chipPool=new T.InstancedMesh(this.chipGeometry,this.chipMaterial,this.maxChips);this.chipPool.name='wall / directional grey chips';this.chipPool.instanceMatrix.setUsage(T.DynamicDrawUsage);this.chipPool.frustumCulled=false;this.chipPool.count=0;this.chipPool.castShadow=false;this.chipPool.receiveShadow=false;scene.add(this.chipPool);this.temp=new T.Object3D();this.color=new T.Color();
 }
 trigger(event){
  if(this.disposed||event?.type!=='scenery'||!finite3(event.position)||!finite3(event.normal))return false;
  const normal=new T.Vector3(...event.normal);if(normal.lengthSq()<EPS)return false;normal.normalize();
  const position=new T.Vector3(...event.position),seed=++this.sequence*11+(Number.isFinite(event.projectileId)?event.projectileId:0),right=new T.Vector3().crossVectors(normal,Math.abs(normal.y)>.9?new T.Vector3(1,0,0):UP).normalize(),up=new T.Vector3().crossVectors(right,normal).normalize();
  const mark=new T.Group();mark.name='wall / fixed chipped impression';mark.position.copy(position).addScaledVector(normal,.002);mark.quaternion.setFromUnitVectors(FORWARD,normal);mark.rotateZ(hash(seed)*Math.PI*2);
  const impression=new T.Mesh(this.scar,this.scarMaterial);impression.castShadow=impression.receiveShadow=false;mark.add(impression);this.scene.add(mark);this.marks.push({object:mark,position:position.toArray(),normal:normal.toArray(),projectileId:event.projectileId??null,colliderId:event.colliderId??null});
  while(this.marks.length>this.maxMarks)this.scene.remove(this.marks.shift().object);
  const group=new T.Group();group.name='wall / short grey contact dust';group.position.copy(position).addScaledVector(normal,.009);this.scene.add(group);const puffs=[];
  for(let i=0;i<2;i++){const material=plumeMaterial(seed+i*5,'smoke'),mesh=new T.Mesh(this.dustGeometry,material);mesh.quaternion.setFromUnitVectors(FORWARD,normal);mesh.visible=false;mesh.castShadow=mesh.receiveShadow=false;group.add(mesh);puffs.push({mesh,delay:.012+i*.022});}
  this.active.push({group,puffs,age:0,life:.38,normal,right,up,seed,position:position.toArray()});while(this.active.length>this.maxBursts)this.removeBurst(this.active.shift());
  for(let i=0;i<9;i++){const angle=i*2.399+seed,n=.75+hash(seed+i*3)*1.35,spread=.25+hash(seed+i*5)*.65,velocity=normal.clone().multiplyScalar(n).addScaledVector(right,Math.cos(angle)*spread).addScaledVector(up,Math.sin(angle)*spread);this.chips.push({origin:position.clone().addScaledVector(normal,.009),position:position.clone(),velocity,age:0,life:.22+hash(seed+i*9)*.26,size:.007+hash(seed+i*13)*.009,seed:seed+i});}
  this.chips=this.chips.slice(-this.maxChips);this.drawChips();return true;
 }
 pulse(event){return this.trigger(event);}
 removeBurst(burst){this.scene.remove(burst.group);for(const p of burst.puffs)p.mesh.material.dispose();burst.group.clear();}
 drawChips(){let count=0;for(const p of this.chips){const fade=1-p.age/p.life;this.temp.position.copy(p.origin).addScaledVector(p.velocity,p.age);this.temp.position.y-=1.8*p.age*p.age;p.position.copy(this.temp.position);this.temp.rotation.set(p.seed+p.age*14,p.age*11,p.age*7);this.temp.scale.set(p.size*fade,p.size*.45*fade,p.size*1.25*fade);this.temp.updateMatrix();this.chipPool.setMatrixAt(count,this.temp.matrix);this.chipPool.setColorAt(count,this.color.set(p.seed%2?'#b8b8a9':'#737c79'));count++;}this.chipPool.count=count;this.chipPool.instanceMatrix.needsUpdate=true;if(this.chipPool.instanceColor)this.chipPool.instanceColor.needsUpdate=true;}
 update(dt){
  if(this.disposed)return;dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  for(const burst of this.active){burst.age+=dt;for(let i=0;i<burst.puffs.length;i++){const {mesh,delay}=burst.puffs[i],age=burst.age-delay,t=T.MathUtils.clamp(age/(burst.life-delay),0,1);mesh.visible=age>=0&&t<1;const radius=.018+t*.082;mesh.scale.set(radius*(1+i*.15),radius*.77,radius*.50);mesh.position.copy(burst.normal).multiplyScalar(.008+Math.max(0,age)*.19).addScaledVector(burst.right,(i?1:-1)*t*.025);mesh.position.y+=Math.max(0,age)*.045;mesh.material.uniforms.phase.value=Math.max(0,age);mesh.material.uniforms.opacity.value=Math.min(1,Math.max(0,age/.025))*(1-t)**1.6*.24;}}
  for(const burst of this.active.filter(b=>b.age>=b.life))this.removeBurst(burst);this.active=this.active.filter(b=>b.age<b.life);
  for(const p of this.chips)p.age+=dt;this.chips=this.chips.filter(p=>p.age<p.life);this.drawChips();
 }
 reset(){for(const mark of this.marks)this.scene.remove(mark.object);this.marks=[];for(const burst of this.active)this.removeBurst(burst);this.active=[];this.chips=[];this.chipPool.count=0;this.sequence=0;}
 inspection(){return {worldSpace:true,sceneryOnly:true,marks:this.marks.map(m=>({position:m.position.slice(),normal:m.normal.slice(),projectileId:m.projectileId,colliderId:m.colliderId,renderPosition:m.object.position.toArray()})),active:this.active.map(b=>({age:b.age,life:b.life,position:b.position.slice(),normal:b.normal.toArray(),dustVisible:b.puffs.some(p=>p.mesh.visible)})),chips:this.chips.map(p=>({age:p.age,life:p.life,position:p.position.toArray(),velocity:p.velocity.toArray()})),budget:{marks:this.maxMarks,bursts:this.maxBursts,chips:this.maxChips},disposed:this.disposed};}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;this.scene.remove(this.chipPool);for(const geometry of[this.scar,this.chipGeometry,this.dustGeometry])geometry.dispose();for(const material of[this.scarMaterial,this.chipMaterial])material.dispose();}
}
