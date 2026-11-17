import * as T from 'three';

// RealShot r26 · fire and smoke for the level's explosions.
//
// One instanced, camera-facing quad per puff, one draw call for all of them. A puff is a ragged ball cut out
// of a tiling billow texture; as it ages, holes open from its thin parts (it dissolves instead of fading as a
// disc). Each puff carries a temperature: hot gas glows far above white (so the post pass blooms it) through a
// white -> yellow -> orange -> red ramp, and as it cools the same puff turns into smoke that is lit from above
// by the current sun and sky. Colour is written premultiplied, so glow adds and smoke covers in a single pass.
const clamp=T.MathUtils.clamp;
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};

// R: big cauliflower billows, G: finer break-up. Both tile.
function billowTexture(size=256){
 const data=new Uint8Array(size*size*4),rnd=(x,y,k)=>hash(x*17.13+y*91.7+k*313.1);
 const cells=(u,v,n,k)=>{const cx=Math.floor(u*n),cy=Math.floor(v*n);let d=9;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const gx=cx+i,gy=cy+j,wx=((gx%n)+n)%n,wy=((gy%n)+n)%n,px=gx+rnd(wx,wy,k),py=gy+rnd(wx,wy,k+1),dx=px-u*n,dy=py-v*n;d=Math.min(d,dx*dx+dy*dy);}
  return Math.sqrt(d);};
 const value=(u,v,n,k)=>{const x=u*n,y=v*n,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),w=(a,b)=>rnd(((a%n)+n)%n,((b%n)+n)%n,k);
  return (w(x0,y0)*(1-sx)+w(x0+1,y0)*sx)*(1-sy)+(w(x0,y0+1)*(1-sx)+w(x0+1,y0+1)*sx)*sy;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,fbm=value(u,v,4,3)*.5+value(u,v,8,5)*.3+value(u,v,16,7)*.2;
  const big=clamp(1-cells(u,v,4,11)*1.15,0,1)*.62+clamp(1-cells(u,v,9,13)*1.2,0,1)*.2+fbm*.28;
  const fine=clamp(1-cells(u,v,11,17)*1.2,0,1)*.5+clamp(1-cells(u,v,23,19)*1.2,0,1)*.2+fbm*.35;
  const i=(y*size+x)*4;data[i]=clamp(big,0,1)*255;data[i+1]=clamp(fine,0,1)*255;data[i+2]=fbm*255;data[i+3]=255;
 }
 const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}

// The aerial haze is worked out once per puff here (not per pixel): a blast can put a dozen screen-filling
// layers on top of each other, so the pixel shader stays down to two texture reads.
const VERT=`#include <common>
attribute vec4 aPos;attribute vec4 aDat;attribute vec4 aCol;attribute float aTall;
varying vec2 vUv;varying vec2 vP;varying vec4 vDat;varying vec4 vCol;varying float vNear;varying float vTall;
#ifdef USE_FOG
uniform vec3 fogColor;uniform vec3 alpSun,alpNear,alpFar,alpTint;uniform vec4 alpParams;uniform vec2 alpExtra;
#ifdef FOG_EXP2
uniform float fogDensity;
#endif
varying vec4 vHaze;
#endif
void main(){
 vUv=uv;vDat=aDat;vCol=aCol;vTall=aTall;
 vec4 mvPosition=viewMatrix*vec4(aPos.xyz,1.0);
 // a puff that reaches the eye thins out instead of filling the screen
 vNear=smoothstep(.7,4.2,-mvPosition.z-aPos.w*.15);
 float c=cos(aDat.w),s=sin(aDat.w);
 vP=vec2(c*position.x-s*position.y,s*position.x+c*position.y);
 mvPosition.xy+=vP*aPos.w*vec2(1.,aTall);
 gl_Position=vNear>0.?projectionMatrix*mvPosition:vec4(2.,2.,2.,1.);
 #ifdef USE_FOG
  vec3 rd=aPos.xyz-cameraPosition;float dist=length(rd);rd/=max(dist,1e-4);
  float H=alpParams.y,h0=max(cameraPosition.y,-2.),h1=max(aPos.y,-2.),dh=h1-h0;
  float od=abs(dh)>.02?dist*H*(exp(-h0/H)-exp(-h1/H))/dh:dist*exp(-h0/H);
  #ifdef FOG_EXP2
   float strength=fogDensity;
  #else
   float strength=1.;
  #endif
  float haze=1.-exp(-od*alpParams.x*strength),mu=max(dot(rd,alpSun),0.);
  vec3 hc=mix(alpNear,alpFar,smoothstep(alpParams.z,alpParams.w,dist));
  hc+=alpTint*(pow(mu,5.)*.32+pow(mu,48.)*alpExtra.x);
  vHaze=vec4(hc*fogColor*haze,1.-haze);
 #endif
}`;
// aDat: x age 0..1, y temperature, z seed, w rotation. aCol: smoke albedo, opacity.
const FRAG=`#include <common>
#ifdef USE_FOG
varying vec4 vHaze;
#endif
uniform sampler2D map;uniform vec3 uLight,uShade;uniform float uGain;
varying vec2 vUv;varying vec2 vP;varying vec4 vDat;varying vec4 vCol;varying float vNear;varying float vTall;
void main(){
 float f=vDat.x,heat=vDat.y,seed=vDat.z;
 vec2 c=vUv-.5;
 // a flame narrows to a tip
 if(vTall>1.)c.x*=mix(1.,3.2,smoothstep(-.25,.5,c.y));
 float r=length(c)*2.;
 vec2 q=vUv*.58+vec2(fract(seed*7.31),fract(seed*3.17));
 vec3 lo=texture2D(map,q+vec2(0.,-f*.06)).rgb;float fine=texture2D(map,q*3.1+vec2(f*.09,0.)).g;
 float billow=lo.r*.6+fine*.2+lo.b*.24;
 float body=smoothstep(1.,.3,r+(billow-.5)*1.25);
 float cut=mix(-.25,.8,pow(f,1.5));
 float dens=body*smoothstep(cut,cut+.36,billow);
 if(dens<.004)discard;
 float temp=heat*smoothstep(.26,.96,billow*body*1.12+(1.-r)*.14)*smoothstep(.08,.5,fine+body*.25);
 vec3 fire=mix(vec3(1.,.13,.015),vec3(1.,.5,.08),smoothstep(.12,.5,temp));fire=mix(fire,vec3(1.,.9,.66),smoothstep(.6,1.15,temp));
 vec3 glow=fire*temp*temp*uGain*dens;
 float lit=clamp(.46+vP.y*1.15+(billow-.5)*.9,0.,1.);
 vec3 smoke=vCol.rgb*mix(uShade,uLight,lit*lit*(3.-2.*lit));
 float a=dens*vCol.a*(1.-smoothstep(.72,1.,f))*vNear;glow*=vNear;
 #ifdef USE_FOG
  smoke=smoke*vHaze.a+vHaze.rgb;glow*=vHaze.a;
 #endif
 gl_FragColor=vec4(smoke*a+glow,a);
}`;

export class Fire{
 constructor(scene,cap=1500){
  this.cap=cap;this.live=[];this.emitters=new Set();this.c=new T.Color();this.n=0;this.cover=0;this.budget=7;
  const plane=new T.PlaneGeometry(1,1),geo=new T.InstancedBufferGeometry();
  geo.index=plane.index;geo.setAttribute('position',plane.attributes.position);geo.setAttribute('uv',plane.attributes.uv);
  const attr=()=>{const a=new T.InstancedBufferAttribute(new Float32Array(cap*4),4);a.setUsage(T.DynamicDrawUsage);return a;};
  this.aPos=attr();this.aDat=attr();this.aCol=attr();this.aTall=new T.InstancedBufferAttribute(new Float32Array(cap).fill(1),1);this.aTall.setUsage(T.DynamicDrawUsage);geo.setAttribute('aTall',this.aTall);geo.setAttribute('aPos',this.aPos);geo.setAttribute('aDat',this.aDat);geo.setAttribute('aCol',this.aCol);geo.instanceCount=0;
  this.material=new T.ShaderMaterial({name:'fire / instanced puffs',uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{map:{value:null},uLight:{value:new T.Vector3(1.6,1.6,1.6)},uShade:{value:new T.Vector3(.25,.28,.34)},uGain:{value:11}}]),
   vertexShader:VERT,fragmentShader:FRAG,transparent:true,premultipliedAlpha:true,depthWrite:false,fog:true,toneMapped:false});
  this.material.uniforms.map.value=billowTexture();
  this.mesh=new T.Mesh(geo,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.mesh.name='level fire';scene.add(this.mesh);this.geo=geo;
 }
 // light: what the lit side of smoke receives; shade: what its underside receives (both linear)
 setLight(light,shade){this.material.uniforms.uLight.value.fromArray(light);this.material.uniforms.uShade.value.fromArray(shade);}
 // tall: a flame is a puff stretched upward (it keeps upright instead of tumbling)
 // heat: temperature at birth (1 glows orange, 1.3 has a white core); cool: seconds until it is plain smoke
 puff({position,velocity=[0,1,0],color='#1c1815',size=1,grow=1.5,life=2,opacity=.8,drag=1,lift=0,heat=0,cool=.4,delay=0,spin=0,tall=1}){
  this.c.set(color);const s=++this.n;
  this.live.push({x:position[0],y:position[1],z:position[2],vx:velocity[0],vy:velocity[1],vz:velocity[2],r:this.c.r,g:this.c.g,b:this.c.b,tall,rot:tall>1?(hash(s)-.5)*.5:hash(s)*6.283,spin:tall>1?0:spin||(hash(s+5)-.5)*.9,seed:hash(s+9),size,grow,life,age:-delay,opacity,drag,lift,heat,cool,sc:size,d:0});
  if(this.live.length>this.cap)this.live.shift();
 }
 // a standing fire or smoke source: {position, until, rate, make(p) -> the puff options at position p}
 emitter(o){const e={rate:8,acc:0,until:Infinity,...o};this.emitters.add(e);return e;}
 update(dt,time,wind,viewer=null){
  for(const e of this.emitters){
   if(time>e.until){this.emitters.delete(e);continue;}
   e.acc+=dt*e.rate;while(e.acc>=1){e.acc--;const p=typeof e.position==='function'?e.position():e.position;if(p)this.puff(e.make(p,time));}
  }
  // the fill budget: `cover` is how many screens the puffs drew last frame; over budget, spent smoke clears faster
  const keep=[],hurry=1+clamp(this.cover/this.budget-1,0,2.5)*1.6;let cover=0;
  for(const q of this.live){
   const was=q.age;q.age+=dt;if(was>=0&&q.age>q.cool)q.age+=dt*(hurry-1);if(q.age>=q.life)continue;if(q.age<0){keep.push(q);continue;}
   const k=Math.exp(-q.drag*dt),cold=clamp(q.age/Math.max(.05,q.cool),0,1);
   q.vx=q.vx*k+wind[0]*dt*.6*cold;q.vz=q.vz*k+wind[2]*dt*.6*cold;q.vy=q.vy*k+q.lift*dt;
   q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;q.rot+=q.spin*dt;q.sc=q.size+q.grow*Math.sqrt(Math.min(q.age,1.7));
   if(viewer){const dx=q.x-viewer.x,dy=q.y-viewer.y,dz=q.z-viewer.z;q.d=dx*dx+dy*dy+dz*dz;cover+=Math.min(1,q.sc*q.sc*q.tall*.55/Math.max(q.d,1));}
   keep.push(q);
  }
  this.live=keep;this.cover=cover;
  const list=keep.filter(q=>q.age>=0);if(viewer)list.sort((a,b)=>b.d-a.d);
  const P=this.aPos.array,D=this.aDat.array,C=this.aCol.array,H=this.aTall.array;
  for(let i=0;i<list.length;i++){const q=list[i],j=i*4,cold=clamp(q.age/Math.max(.05,q.cool),0,1);
   P[j]=q.x;P[j+1]=q.y;P[j+2]=q.z;P[j+3]=q.sc;D[j]=q.age/q.life;D[j+1]=q.heat*(1-cold)*(1-cold);D[j+2]=q.seed;D[j+3]=q.rot;
   H[i]=q.tall;C[j]=q.r;C[j+1]=q.g;C[j+2]=q.b;C[j+3]=q.opacity*Math.min(1,q.age/.06+.35);}
  this.geo.instanceCount=list.length;this.aPos.needsUpdate=this.aDat.needsUpdate=this.aCol.needsUpdate=this.aTall.needsUpdate=true;
 }
 reset(){this.live=[];this.emitters.clear();this.geo.instanceCount=0;}
 get count(){return this.live.length;}

 // ---- recipes ----
 // A fireball that rolls up into a smoke column. R: the fireball's radius in metres; up: the surface normal.
 // size 0 small (grenade), 1 big (rocket, bomb, fuel), 2 huge (the tactical missile).
 blast(position,R,{size=1,up=[0,1,0],ground=true,seed=0}={}){
  const [x,y,z]=position,h=k=>hash(seed+(this.n+k)*1.618),thin=clamp(1.25-this.live.length/700,.4,1),N=Math.ceil([10,16,30][size]*thin),S=Math.ceil([6,9,14][size]*thin),slow=[1,1,2.1][size],hot=size===2?1.6:1.35;
  // the fireball: hot gas thrown out and up, braking hard
  for(let i=0;i<N;i++){const u=h(i)*.9+.1,a=h(i+31)*6.283,rr=Math.sqrt(1-u*u),d=[rr*Math.cos(a)+up[0]*.5,u+up[1]*.5,rr*Math.sin(a)+up[2]*.5],sp=R*(2.6+h(i+7)*3.6)/slow;
   this.puff({position:[x+d[0]*R*.18,y+d[1]*R*.18+R*.1,z+d[2]*R*.18],velocity:[d[0]*sp,d[1]*sp+R*.9/slow,d[2]*sp],color:'#191512',size:R*.38,grow:R*.9/Math.sqrt(slow),life:(.75+h(i+3)*.6)*slow,opacity:.92,drag:4.2/slow,lift:2.4,heat:hot,cool:(.34+h(i+11)*.2)*slow,delay:i*.006});}
  // tongues: thin, fast jets that outrun the ball
  for(let i=0;i<(size?7:4);i++){const a=h(i+60)*6.283,u=h(i+70)*.8,rr=Math.sqrt(1-u*u),sp=R*(6.5+h(i+80)*4)/slow;
   this.puff({position:[x,y+R*.15,z],velocity:[rr*Math.cos(a)*sp,u*sp,rr*Math.sin(a)*sp],color:'#231d18',size:R*.2,grow:R*.5,life:(.4+h(i+90)*.25)*slow,opacity:.8,drag:5/slow,lift:1,heat:1.5,cool:.28*slow});}
  // the column: what is left rolls upward, still glowing inside for a moment
  for(let i=0;i<S;i++){const a=h(i+120)*6.283,o=h(i+130)*R*.45;
   this.puff({position:[x+Math.cos(a)*o,y+R*(.25+h(i+140)*.5),z+Math.sin(a)*o],velocity:[Math.cos(a)*R*.5,R*(.7+h(i+150)*.9)/slow,Math.sin(a)*R*.5],color:i%3?'#2a2520':'#3b352f',size:R*.5,grow:R*(.62+h(i+160)*.3),life:(2.4+h(i+170)*2.2)*slow,opacity:.78,drag:1.3,lift:1.1,heat:size===2?1.05:.8,cool:(size===2?.85:.62)*slow,delay:.08+h(i+180)*.3*slow});}
  // the tactical missile: the fire keeps climbing as a stem under a rolling cap
  if(size===2)for(let i=0;i<12;i++){const a=h(i+300)*6.283,o=h(i+310)*R*.3,d=.25+i*.07;
   this.puff({position:[x+Math.cos(a)*o,y+R*.3,z+Math.sin(a)*o],velocity:[Math.cos(a)*R*.25,R*(1.5+h(i+320)*.8),Math.sin(a)*R*.25],color:'#231f1b',size:R*.36,grow:R*.42,life:3.2+h(i+330)*2.4,opacity:.85,drag:.9,lift:1.6,heat:1.3,cool:1.1+h(i+340)*.7,delay:d});}
  if(!ground)return;
  // the snow: a skirt racing out along the ground, and spray thrown up that falls back
  const G=Math.ceil([7,10,18][size]*thin);
  for(let i=0;i<G;i++){const a=i/G*6.283+h(i+200),sp=R*(2.3+h(i+210)*2.2);
   this.puff({position:[x+Math.cos(a)*R*.3,y+.25,z+Math.sin(a)*R*.3],velocity:[Math.cos(a)*sp,R*.35,Math.sin(a)*sp],color:'#e9eef2',size:R*.28,grow:R*.6,life:(1.3+h(i+220)*1.1)*slow,opacity:.42,drag:2.8,lift:.3,delay:.02});}
  for(let i=0;i<(size?6:3);i++){const a=h(i+240)*6.283,o=R*.5*h(i+250);
   this.puff({position:[x+Math.cos(a)*o,y+.4,z+Math.sin(a)*o],velocity:[Math.cos(a)*R*.9,R*(3.2+h(i+260)*2.4),Math.sin(a)*R*.9],color:'#eef3f6',size:R*.26,grow:R*.55,life:1.5+h(i+270),opacity:.6,drag:1.6,lift:-7});}
 }
 // what burns on after a fuel store goes up: flames at the base and a black column, for `seconds`
 burn(position,time,seconds=8,scale=1){
  const [x,y,z]=position,r=()=>Math.random()-.5;
  this.emitter({position,until:time+seconds*.75,rate:16,make:()=>{const w=(.42+Math.random()*.3)*scale;return {position:[x+r()*1.5*scale,y+w*.9,z+r()*1.5*scale],velocity:[r()*.3,1.3+Math.random()*1.2,r()*.3],color:'#171310',size:w,grow:.25*scale,life:.42+Math.random()*.3,opacity:.3,drag:.4,lift:2.4,heat:1.06,cool:.6,tall:2.3+Math.random()*.8};}});
  this.emitter({position,until:time+seconds,rate:5,make:()=>({position:[x+r()*.8*scale,y+.9,z+r()*.8*scale],velocity:[r()*.4,2.3+Math.random(),r()*.4],color:'#141210',size:.8*scale,grow:1.5*scale,life:4.5+Math.random()*2.5,opacity:.8,drag:.35,lift:.5,heat:.3,cool:.35})});
 }
}
