import * as T from 'three';
import {cloudGeometry, plumeMaterial} from './combat-burst.mjs';

const MAX_IMPACTS=12, MAX_SPARKS=160, MAX_CHIPS=72;
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
const vector=(value,fallback)=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)?new T.Vector3(...value):fallback.clone();

// Surface normal points out of the hull. Reflected shot energy and the normal
// define a narrow spray cone rather than a camera-facing radial particle fan.
export function impactFrame(event){
 const direction=vector(event.direction,new T.Vector3(0,0,-1)).normalize();
 if(direction.lengthSq()<.5)direction.set(0,0,-1);
 const normal=vector(event.normal,direction.clone().negate()).normalize();
 if(normal.lengthSq()<.5)normal.copy(direction).negate();
 const axis=direction.clone().reflect(normal).multiplyScalar(.62).addScaledVector(normal,.65).normalize();
 const right=new T.Vector3().crossVectors(axis,Math.abs(axis.y)>.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0)).normalize();
 const up=new T.Vector3().crossVectors(right,axis).normalize();
 return {direction,normal,axis,right,up};
}

export class ImpactBursts{
 constructor(scene){
  this.scene=scene;this.active=[];this.sparks=[];this.chips=[];this.brokenIds=new Set();this.sequence=0;this.disposed=false;
  this.cloud=cloudGeometry(4.1);this.sparkGeometry=new T.CylinderGeometry(.40,.08,1,5);this.chipGeometry=new T.TetrahedronGeometry(1,0);
  this.sparkMaterial=new T.MeshBasicMaterial({color:'#e8a34a',toneMapped:false});
  this.chipMaterial=new T.MeshStandardMaterial({color:'#7b8e93',metalness:.78,roughness:.37});
  this.sparkPool=new T.InstancedMesh(this.sparkGeometry,this.sparkMaterial,MAX_SPARKS);this.chipPool=new T.InstancedMesh(this.chipGeometry,this.chipMaterial,MAX_CHIPS);
  for(const pool of [this.sparkPool,this.chipPool]){pool.instanceMatrix.setUsage(T.DynamicDrawUsage);pool.frustumCulled=false;pool.count=0;pool.castShadow=false;pool.receiveShadow=false;scene.add(pool);}
  this.transform=new T.Object3D();this.color=new T.Color();this.yAxis=new T.Vector3(0,1,0);
 }
 trigger(event){
  if(this.disposed||event.type!=='hit'||!(event.hp>0)||!event.position)return false;
  const {direction,normal,axis,right,up}=impactFrame(event),origin=vector(event.position,new T.Vector3()).addScaledVector(normal,.012),id=event.enemyId;
  const armorBreak=Number.isFinite(event.maxHP)&&event.maxHP>0&&event.hp/event.maxHP<=.5&&!this.brokenIds.has(id);
  if(armorBreak){this.brokenIds.add(id);while(this.brokenIds.size>128)this.brokenIds.delete(this.brokenIds.values().next().value);}
  const seed=(id??0)+this.sequence++*13,group=new T.Group();group.name=armorBreak?'armor fracture spray':'metal surface impact';group.position.copy(origin);this.scene.add(group);
  const flash=new T.Mesh(this.cloud,plumeMaterial(seed,'fire')),wisps=[];flash.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);group.add(flash);
  for(let i=0;i<2;i++){const o=new T.Mesh(this.cloud,plumeMaterial(seed+i*6,'smoke'));o.rotation.set(hash(seed+i)*2,hash(seed+i+1)*3,0);o.visible=false;group.add(o);wisps.push(o);}
  this.active.push({group,flash,wisps,origin,direction,normal,axis,right,up,age:0,life:armorBreak?.50:.34,seed,armorBreak,enemyId:id});
  while(this.active.length>MAX_IMPACTS)this.remove(this.active.shift());
  for(let i=0;i<(armorBreak?16:10);i++){
   const angle=i*2.399+seed,spread=.10+hash(seed+i*3)*.48,ray=axis.clone().addScaledVector(right,Math.cos(angle)*spread).addScaledVector(up,Math.sin(angle)*spread).normalize();
   this.sparks.push({origin:origin.clone(),velocity:ray.multiplyScalar(2.1+hash(seed+i*7)*3.1),age:0,life:.10+hash(seed+i*11)*.18,size:.010+hash(seed+i*17)*.008,seed:seed+i});
  }
  for(let i=0;i<(armorBreak?7:3);i++){
   const angle=i*2.399+seed,ray=axis.clone().multiplyScalar(.45).addScaledVector(right,Math.cos(angle)*.65).addScaledVector(up,Math.sin(angle)*.55).addScaledVector(normal,.4).normalize();
   this.chips.push({origin:origin.clone(),velocity:ray.multiplyScalar(.7+hash(seed+i*19)*1.5),age:0,life:.22+hash(seed+i*23)*.26,size:(armorBreak?.024:.013)+hash(seed+i*29)*.015,seed:seed+i});
  }
  this.sparks=this.sparks.slice(-MAX_SPARKS);this.chips=this.chips.slice(-MAX_CHIPS);this.update(0);return true;
 }
 remove(burst){this.scene.remove(burst.group);burst.flash.material.dispose();for(const o of burst.wisps)o.material.dispose();burst.group.clear();}
 update(dt){
  if(this.disposed)return;dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  for(const b of this.active){
   b.age+=dt;const t=b.age,flashLife=b.armorBreak?.085:.055;
   b.flash.visible=t<flashLife;const radius=(b.armorBreak?.12:.075)*(1+t/flashLife*.55);b.flash.scale.set(radius,radius*.70,radius*.25);b.flash.material.uniforms.opacity.value=(1-t/flashLife)*.98;b.flash.material.uniforms.phase.value=t;
   b.wisps.forEach((o,i)=>{const age=t-.028-i*.025,p=T.MathUtils.clamp(age/(b.life-.028-i*.025),0,1);o.visible=age>=0&&p<1;const radius=(b.armorBreak?.055:.036)+p*.07;o.scale.set(radius*.65,radius,radius*1.7);o.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),b.axis);o.position.copy(b.axis).multiplyScalar(.025+age*.45).addScaledVector(b.up,(i?1:-1)*.035);o.position.y+=age*.10;o.material.uniforms.opacity.value=Math.min(1,Math.max(0,age/.035))*(1-p)**1.7*(b.armorBreak?.32:.22);o.material.uniforms.phase.value=age;});
  }
  for(const b of this.active.filter(b=>b.age>=b.life))this.remove(b);this.active=this.active.filter(b=>b.age<b.life);
  const render=(particles,pool,spark)=>{
   let n=0;for(const p of particles){p.age+=dt;if(p.age>=p.life)continue;const fade=1-p.age/p.life;
    this.transform.position.copy(p.origin).addScaledVector(p.velocity,p.age);this.transform.position.y-=(spark?.5:1.4)*p.age*p.age;
    if(spark){this.transform.quaternion.setFromUnitVectors(this.yAxis,p.velocity.clone().normalize());this.transform.scale.set(p.size,p.size*(3+fade*7),p.size);this.color.set(fade>.45?'#f1ba69':'#a86629');}
    else{this.transform.rotation.set(p.seed+p.age*13,p.age*9,p.age*7);this.transform.scale.set(p.size*fade,p.size*.32*fade,p.size*1.4*fade);this.color.set(p.seed%2?'#8e9999':'#3d4c53');}
    this.transform.updateMatrix();pool.setMatrixAt(n,this.transform.matrix);pool.setColorAt(n,this.color);n++;
   }pool.count=n;pool.instanceMatrix.needsUpdate=true;if(pool.instanceColor)pool.instanceColor.needsUpdate=true;return particles.filter(p=>p.age<p.life);
  };
  this.sparks=render(this.sparks,this.sparkPool,true);this.chips=render(this.chips,this.chipPool,false);
 }
 reset(){for(const b of this.active)this.remove(b);this.active=[];this.sparks=[];this.chips=[];this.brokenIds.clear();this.sparkPool.count=this.chipPool.count=0;}
 inspection(){return {active:this.active.map(b=>({enemyId:b.enemyId,age:b.age,life:b.life,armorBreak:b.armorBreak,position:b.origin.toArray(),direction:b.direction.toArray(),normal:b.normal.toArray(),sprayAxis:b.axis.toArray(),flashVisible:b.flash.visible,smokeVisible:b.wisps.some(o=>o.visible)})),sparks:this.sparks.length,chips:this.chips.length,breaksRemembered:this.brokenIds.size,budget:{impacts:MAX_IMPACTS,sparks:MAX_SPARKS,chips:MAX_CHIPS},worldSpace:true};}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;this.scene.remove(this.sparkPool,this.chipPool);for(const g of [this.cloud,this.sparkGeometry,this.chipGeometry])g.dispose();this.sparkMaterial.dispose();this.chipMaterial.dispose();}
}
