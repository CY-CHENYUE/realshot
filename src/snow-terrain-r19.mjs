import * as T from 'three';
import {createNoise,clamp,lerp,smooth,GLSL_NOISE} from './snow-noise.mjs';

// Track coordinates: x is across the valley (world x), S is distance along the
// route. Chunk geometry is authored in absolute track space (x, h, -S); the
// whole terrain group moves by the travelled distance, so content always comes
// toward the viewer and the next section appears from the far haze first.

export const SECTIONS=Object.freeze([
 Object.freeze({id:'pine-valley',name:'松林雪谷',en:'PINE VALLEY'}),
 Object.freeze({id:'glacier-canyon',name:'冰川峡谷',en:'GLACIER CANYON'}),
 Object.freeze({id:'wind-col',name:'风口垭口',en:'WIND COL'}),
 Object.freeze({id:'frozen-lake',name:'冰湖雪原',en:'FROZEN LAKE'}),
]);
export const SECTION_LENGTH=120,SECTION_BLEND=42,CYCLE=SECTION_LENGTH*SECTIONS.length;

// Valley floor half width stays >= 7.6 m in every section. Inside the
// gameplay corridor (enemies hover at |x| <= 6, y ~1.05) the floor is a calm
// route bed (|x| < 2.4) rising into low snowbanks (< ~.6 m).
const PROFILES=[
 {W:8.8,slope:.44,pow:1.34,rough:2.0,big:40,cliff:0,floor:.16,trees:1.0,rocks:.45,ice:0,lake:0,spires:0,wind:.35,snow:.75},
 {W:8.0,slope:1.15,pow:1.18,rough:3.4,big:58,cliff:.85,floor:.10,trees:.18,rocks:.55,ice:1,lake:0,spires:1,wind:.25,snow:.45},
 {W:9.8,slope:.66,pow:1.28,rough:4.6,big:50,cliff:.3,floor:.24,trees:.32,rocks:1.0,ice:.12,lake:0,spires:.15,wind:1,snow:1},
 {W:12.6,slope:.2,pow:1.5,rough:1.5,big:34,cliff:0,floor:.07,trees:.55,rocks:.3,ice:.35,lake:1,spires:.25,wind:.15,snow:.4},
];
export const MIN_FLOOR_HALF_WIDTH=Math.min(...PROFILES.map(p=>p.W))-1.4*1.0;

export function sectionWeights(S,out=[0,0,0,0]){
 const u=((S%CYCLE)+CYCLE)%CYCLE,i=Math.floor(u/SECTION_LENGTH),f=u-i*SECTION_LENGTH;
 const t=smooth(SECTION_LENGTH-SECTION_BLEND,SECTION_LENGTH,f);
 out[0]=out[1]=out[2]=out[3]=0;out[i]+=1-t;out[(i+1)%4]+=t;return out;
}
export function sectionAt(S){const u=((S%CYCLE)+CYCLE)%CYCLE,i=Math.floor(u/SECTION_LENGTH);return {index:i,...SECTIONS[i],progress:(u-i*SECTION_LENGTH)/SECTION_LENGTH};}
const KEYS=Object.keys(PROFILES[0]);
export function profileAt(S,out={}){
 const w=sectionWeights(S);for(const k of KEYS){let v=0;for(let i=0;i<4;i++)v+=PROFILES[i][k]*w[i];out[k]=v;}return out;
}

// shape(x,S,h,w): optional last word on the height (r27: the level cuts its overlooks in here), so the mesh,
// the props and the rules all read one surface. w is the floor half width on that side.
// rock(x,S,w): optional 0..1 where steep ground is bare rock whatever the section (w: a function giving the half width).
export function createTerrainField(seed=0x51a0,{shape=null,rock=null}={}){
 const N=createNoise(seed),prof={};
 // Per-row values (depend on S and side only) are cached by the builder.
 function rowInfo(S,side){
  profileAt(S,prof);
  const sideSeed=side<0?0:61.7;
  const meander=(N.fbm(S*.016+sideSeed,3.7+sideSeed,3)-.5)*2;
  // bank and plough-berm parameters vary along the route only (cached per row)
  return {...prof,w:prof.W+meander*1.4,sideSeed,
   bankA:.26+.3*N.fbm(S*.055+sideSeed*.05+1.7,3.1+sideSeed,3),
   bermX:2.95+.28*(N.fbm(S*.03+side*2.1,8.8,2)-.5)*2,bermA:.14+.26*N.fbm(S*.07+side*11.3,4.2,3)};
 }
 function heightRow(x,S,r){
  const ax=Math.abs(x),side=x<0?-1:1;
  const e=ax-r.w;
  // C1 soft start of the valley wall
  const ds=e>1?e-.5:e>-1?(e+1)*(e+1)*.25:0;
  let h=r.slope*Math.pow(ds,r.pow);
  h=h/(1+h/34)*1.0; // nearby slopes saturate instead of growing forever
  const far=smooth(20,64,ax);
  h+=far*r.big*(.45+.85*N.ridged(x*.016+r.sideSeed,S*.016,5));
  const mask=smooth(0,3.5,ds);
  h+=mask*r.rough*(N.ridged(x*.085+r.sideSeed*.3,S*.085,4)-.42)*(.55+.45*Math.min(1,ds/9));
  if(r.cliff>0){const step=3.4,t=h/step,fl=Math.floor(t),fr=t-fl;h=lerp(h,(fl+smooth(.3,.7,fr))*step,r.cliff*mask*smooth(1.5,6,ds));}
  // snow drifts and wind-packed waves on the floor; the packed route bed in
  // the middle stays calmer than the banks
  const floorMask=1-smooth(r.w-1,r.w+2,ax);
  h+=r.floor*(N.fbm(x*.11+side*7,S*.11,3)-.5)*2*floorMask*(.35+.65*smooth(1.6,3.4,ax));
  // route bed and snowbank shoulders: the floor rises from the packed route
  // into wind-built banks that meet the valley wall, so the ground reads as one
  // continuous surface from the bottom corners of the screen to the peaks.
  const bankT=smooth(2.4,7.4,ax),bank=bankT*bankT*r.bankA;
  h+=bank;
  // plough berms lining the groomed rescue route: a soft ridge on each side
  // that runs from the bottom corners of the screen to the vanishing point
  const bd=(ax-r.bermX)/.46,berm=bd*bd<12?r.bermA*Math.exp(-bd*bd):0;
  h+=berm;
  let lake=0;
  if(r.lake>.01){
   lake=r.lake*smooth(.47,.6,N.fbm(x*.05+5.1,S*.028+2.3,3))*(1-smooth(r.w-2.2,r.w-.6,ax))*smooth(2.4,4,ax);
   h=lerp(h,-.06,smooth(0,.35,lake));
  }
  // keep the gameplay corridor clean
  // (banks stay under ~.6 m inside |x|<6.4, below the hovering enemies)
  const corridor=1-smooth(6.4,7.6,ax);
  if(corridor>0)h=lerp(h,clamp(h,-.08,.2+bank+berm),corridor);
  if(shape)h=shape(x,S,h,r.w);
  return {h,lake};
 }
 function height(x,S){return heightRow(x,S,rowInfo(S,x<0?-1:1)).h;}
 // Wind-scoured patches on the banks where dry grass and gravel break through
 // the snow (0..1). Shared by the terrain shader (via aGround) and the grass
 // scatter, so tufts grow where the snow is thin.
 function scour(x,S,wind=.35){
  const ax=Math.abs(x),bank=smooth(2.6,4.1,ax)*(1-smooth(10.5,13.5,ax));
  if(bank<=0)return 0;
  return clamp((N.fbm(x*.43+7.1,S*.19+3.3,3)-(.6-.09*wind))*5.5)*bank;
 }
 return {noise:N,rowInfo,heightRow,height,scour,rock,profileAt:S=>profileAt(S,{})};
}

// Non-uniform columns: dense where the valley walls are seen up close, coarse on
// the far mountainsides that only ever appear small and hazy.
export function terrainColumns(){
 const pos=[];
 for(let x=0;x<6;x+=.3)pos.push(+x.toFixed(3));
 for(let x=6;x<12;x+=.4)pos.push(+x.toFixed(3));
 for(let x=12;x<34;x+=1)pos.push(x);
 for(let x=34;x<=182;x+=4)pos.push(x);
 const cols=[...pos.slice(1).map(v=>-v).reverse(),...pos];
 return Float32Array.from(cols);
}

export function createChunkGeometry(columns,rows){
 const n=columns.length*rows,g=new T.BufferGeometry();
 g.setAttribute('position',new T.BufferAttribute(new Float32Array(n*3),3).setUsage(T.DynamicDrawUsage));
 g.setAttribute('normal',new T.BufferAttribute(new Float32Array(n*3),3).setUsage(T.DynamicDrawUsage));
 g.setAttribute('aSurf',new T.BufferAttribute(new Float32Array(n*4),4).setUsage(T.DynamicDrawUsage));
 g.setAttribute('aGround',new T.BufferAttribute(new Float32Array(n),1).setUsage(T.DynamicDrawUsage));
 const idx=[],C=columns.length;
 for(let r=0;r<rows-1;r++)for(let c=0;c<C-1;c++){const a=r*C+c,b=a+1,d=a+C,e=d+1;idx.push(a,b,d,b,e,d);}
 g.setIndex(n>65535?new T.Uint32BufferAttribute(idx,1):new T.Uint16BufferAttribute(idx,1));
 return g;
}

// Fill a chunk geometry for track range [S0, S0+length]. Returns surface
// statistics plus a sampler for placing props on the same surface.
// local=true authors z relative to the chunk start (z=-(S-S0)); the caller
// places the chunk at z=-S0, which keeps float32 vertex values small even after
// hours of travel.
export function fillChunk(field,geometry,columns,S0,length,rows,{local=false}={}){
 const C=columns.length,R=rows,step=length/(R-1),P=R+2,origin=local?S0:0;
 const H=new Float32Array(P*C),L=new Float32Array(P*C);
 for(let pr=0;pr<P;pr++){
  const S=S0+(pr-1)*step,left=field.rowInfo(S,-1),right=field.rowInfo(S,1);
  for(let c=0;c<C;c++){const x=columns[c],o=field.heightRow(x,S,x<0?left:right);H[pr*C+c]=o.h;L[pr*C+c]=o.lake;}
 }
 const pos=geometry.attributes.position.array,nor=geometry.attributes.normal.array,surf=geometry.attributes.aSurf.array,ground=geometry.attributes.aGround?.array;
 let rockArea=0,minH=Infinity,maxH=-Infinity;const rowsInfo=[];
 for(let r=0;r<R;r++){
  const pr=r+1,S=S0+r*step,info=field.rowInfo(S,1);rowsInfo.push(info);
  for(let c=0;c<C;c++){
   const i=r*C+c,h=H[pr*C+c],x=columns[c];
   const cl=Math.max(0,c-1),cr=Math.min(C-1,c+1),dx=(H[pr*C+cr]-H[pr*C+cl])/(columns[cr]-columns[cl]);
   const dS=(H[(pr+1)*C+c]-H[(pr-1)*C+c])/(2*step);
   let nx=-dx,ny=1,nz=dS;const inv=1/Math.hypot(nx,ny,nz);nx*=inv;ny*=inv;nz*=inv;
   pos[i*3]=x;pos[i*3+1]=h;pos[i*3+2]=-(S-origin);nor[i*3]=nx;nor[i*3+1]=ny;nor[i*3+2]=nz;
   // concavity over a couple of samples: cavities collect cold blue shade,
   // convex crests are wind scoured down to rock.
   const c2l=Math.max(0,c-2),c2r=Math.min(C-1,c+2);
   const lap=(H[pr*C+c2l]+H[pr*C+c2r]+H[Math.max(0,pr-2)*C+c]+H[Math.min(P-1,pr+2)*C+c])*.25-h;
   const spacing=Math.max(.6,(columns[c2r]-columns[c2l])*.5);
   const curv=lap/spacing;
   const ax=Math.abs(x),wallAway=smooth(info.w-.5,info.w+3,ax);
   let rock=smooth(.86,.62,ny)*wallAway;
   rock=clamp(rock+clamp(-curv*1.6)*smooth(.95,.8,ny)*wallAway);
   let bare=0;if(field.rock){bare=field.rock(x,S,()=>field.rowInfo(S,x<0?-1:1).w);if(bare>0)rock=Math.max(rock,bare*smooth(.9,.66,ny));}
   const ice=rock*smooth(.05,.6,info.ice)*(1-smooth(26,48,ax))*(1-bare);
   const ao=clamp(1-clamp(curv*.9)*.75-(1-smooth(0,2.5,ax-info.w))*(1-smooth(-2,0,ax-info.w))*.12,.25,1);
   surf[i*4]=rock*(1-ice*.9);surf[i*4+1]=ice;surf[i*4+2]=ao;surf[i*4+3]=L[pr*C+c];
   if(ground)ground[i]=field.scour?field.scour(x,S,info.wind)*(1-L[pr*C+c])*(1-rock):0;
   if(rock>.5)rockArea++;minH=Math.min(minH,h);maxH=Math.max(maxH,h);
  }
 }
 for(const k of ['position','normal','aSurf','aGround'])if(geometry.attributes[k])geometry.attributes[k].needsUpdate=true;
 geometry.boundingBox=new T.Box3(new T.Vector3(columns[0],minH,-(S0+length-origin)),new T.Vector3(columns[C-1],maxH,-(S0-origin)));
 geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new T.Sphere());
 return {S0,length,origin,minH,maxH,rockFraction:rockArea/(C*R),rowsInfo,step};
}

// Static distant ranges, beyond the streamed valley. They do not travel: real
// forward motion barely moves mountains at this distance.
export function createDistantRangeGeometry(field,{zNear=-150,zFar=-560,xHalf=640,height=125,cols=170,rows=72,offset=0}={}){
 const N=field.noise,g=new T.BufferGeometry();
 const pos=new Float32Array(cols*rows*3),nor=new Float32Array(cols*rows*3),surf=new Float32Array(cols*rows*4),H=new Float32Array(cols*rows);
 const X=c=>-xHalf+2*xHalf*c/(cols-1),Z=r=>zNear+(zFar-zNear)*Math.pow(r/(rows-1),1.25);
 const hf=(x,z)=>{
  const back=smooth(zNear,zNear-120,z),valley=1-smooth(30,120,Math.abs(x))*.0;
  const base=(.35+.95*N.ridged(x*.0065*125/height+3.1+offset,z*.0065*125/height-1.7+offset*.7,6))*height*back;
  const shoulder=smooth(10,160,Math.abs(x))*28*height/125*back;
  return -2+base*valley+shoulder+(N.fbm(x*.03,z*.03,3)-.5)*6*back;
 };
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)H[r*cols+c]=hf(X(c),Z(r));
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const i=r*cols+c,cl=Math.max(0,c-1),cr=Math.min(cols-1,c+1),rl=Math.max(0,r-1),rr=Math.min(rows-1,r+1);
  const dx=(H[r*cols+cr]-H[r*cols+cl])/(X(cr)-X(cl)),dz=(H[rr*cols+c]-H[rl*cols+c])/(Z(rr)-Z(rl));
  let nx=-dx,ny=1,nz=-dz;const inv=1/Math.hypot(nx,ny,nz);nx*=inv;ny*=inv;nz*=inv;
  pos[i*3]=X(c);pos[i*3+1]=H[i];pos[i*3+2]=Z(r);nor[i*3]=nx;nor[i*3+1]=ny;nor[i*3+2]=nz;
  const lap=(H[r*cols+cl]+H[r*cols+cr]+H[rl*cols+c]+H[rr*cols+c])*.25-H[i];
  const rock=clamp(smooth(.8,.5,ny)+clamp(-lap*.06)*.6);
  surf[i*4]=rock;surf[i*4+1]=0;surf[i*4+2]=clamp(1-clamp(lap*.05)*.6,.35,1);surf[i*4+3]=0;
 }
 const idx=[];for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c,b=a+1,d=a+cols,e=d+1;idx.push(a,b,d,b,e,d);}
 g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(nor,3));g.setAttribute('aSurf',new T.BufferAttribute(surf,4));g.setIndex(idx);
 g.computeBoundingBox();g.computeBoundingSphere();return g;
}

// Snow / rock / ice / lake ice surface shader on top of MeshStandardMaterial.
// Masks are baked per vertex and broken up per pixel with noise; detail normals
// (wind ripples on snow, fractured rock, streaked ice) are evaluated in track
// space so the pattern stays glued to the moving ground.
export function createTerrainMaterial(noiseTexture,{flatten=true,name='snow terrain',calm=null}={}){
 const m=new T.MeshStandardMaterial({name,color:0xffffff,roughness:.85,metalness:0,envMapIntensity:.9});
 // calm: shared {uCalm,uCalmK}; ground detail fades inside the screen region
 // in front of the physical object (box surfaces only)
 m.userData.uniforms={uNoise:{value:noiseTexture},uFade:{value:new T.Vector2(flatten?118:1e6,flatten?166:1e6+1)},uDetail:{value:1},uTrackOrigin:{value:0},...(calm||{uCalm:{value:new T.Vector4(.5,.5,.2,.2)},uCalmK:{value:0}})};
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,m.userData.uniforms);
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>',`#include <common>
attribute vec4 aSurf;attribute float aGround;varying vec4 vSurf;varying float vGround;varying vec3 vTrack;varying vec3 vWN;varying vec4 vClip;uniform vec2 uFade;uniform float uTrackOrigin;`)
   .replace('#include <project_vertex>','#include <project_vertex>\nvClip=gl_Position;')
   .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
vWN=normalize(mat3(modelMatrix)*objectNormal);`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
vTrack=transformed;vTrack.z-=uTrackOrigin;vSurf=aSurf;vGround=aGround;
{vec4 alpineW=modelMatrix*vec4(transformed,1.0);float alpineF=smoothstep(uFade.x,uFade.y,-alpineW.z);transformed.y=mix(transformed.y,-1.6,alpineF);}`);
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>',`#include <common>
varying vec4 vSurf;varying float vGround;varying vec3 vTrack;varying vec3 vWN;varying vec4 vClip;uniform float uDetail;uniform vec4 uCalm;uniform float uCalmK;
${GLSL_NOISE}
// snowmobile trail on each bank: cleated belt groove plus two ski runners;
// it wanders and comes and goes along the route. Returns depth 0..1.
// snowcat tread pair groomed into the route bed (always present): two wide
// bands at |x|~1.25 with transverse cleat ribs and pushed-up lips. Returns a
// height offset in metres (negative = pressed in).
float catTrack(vec2 p,float cleatFade){
 float s=-p.y,side=p.x<0.?-1.:1.;
 float c=1.25+.09*sin(s*.043+side*1.7)+.05*sin(s*.11+side*.6);
 float d=abs(abs(p.x)-c);
 float wob=n1(vec2(s*.9,side*3.1))*.05;
 float band=1.-smoothstep(.31+wob,.38+wob,d);
 float lip=smoothstep(.29,.37,d)*(1.-smoothstep(.37,.52,d))*(.6+.4*n1(vec2(s*.35,side+5.)));
 float rib=smoothstep(.3,.6,abs(fract(s/.24+n1(vec2(s*.5,side))*.35)-.5)*2.)*cleatFade*(.5+.5*n1(vec2(s*.2,side*7.)));
 return -band*(.018-.007*rib)+lip*.022;
}
float trailDepth(vec2 p){
 float ax=abs(p.x),side=p.x<0.?-1.:1.,s=-p.y;
 float on=smoothstep(.36,.47,n1(vec2(s*.019+side*5.3,1.7+side)));
 if(on<=0.)return 0.;
 float c=3.75+.48*sin(s*.047+side*1.3)+.3*sin(s*.0131+2.+side);
 float d=abs(ax-c);
 float belt=1.-smoothstep(.15,.23,d);
 float runner=1.-smoothstep(.022,.055,abs(d-.4));
 float cleat=smoothstep(.3,.5,abs(fract(s/.085)-.5)*2.);
 return (belt*(.72+.28*cleat)+runner*.65)*on;
}
float snowH(vec2 p){ return fbm3(p*vec2(.55,1.9))*.75+n1(p*6.5)*.09; }
// rock lies in beds about 0.9 m thick: each steps back a little from the one below, and the seams wander
float bedPhase(vec3 p){ float f=(p.x+p.z)*.7; return p.y*1.05+n1(vec2(p.y*.5,3.1))*.6+sin(f*.19+p.y*.2)*.8+sin(f*.47+1.7)*.3+n1(vec2(f*.6,p.y*.2))*.6; }
float rockH(vec3 p,vec3 n,float bedK){ float a=fbm3(p.xz*1.1)*abs(n.y); float b=fbm3(vec2(p.x+p.z,p.y*1.6)*1.05)*(1.0-abs(n.y)); float bp=bedPhase(p),bed=fract(bp);
 // a ledge runs a few metres and dies out, and no two beds step back the same amount: one unbroken step per bed reads as contour lines drawn on the hill
 float run=smoothstep(.34,.62,n1(vec2((p.x+p.z)*.11,floor(bp)*3.7)))*(.45+.55*n1(vec2(floor(bp)*1.9,7.3)));
 return a+b+n1(vec2(p.y*3.1,p.x*.2+p.z*.2))*.18+(smoothstep(0.,.1,bed)-bed*.55)*.34*(1.0-abs(n.y)*.6)*bedK*run; }
`)
   .replace('#include <color_fragment>',`#include <color_fragment>
vec3 alpineN=normalize(vWN);
vec2 tp=vTrack.xz;
float bn=fbm3(tp*.7+vTrack.y*.15);
float bn2=fbm3(tp*2.9+vTrack.y*1.3);
float rockM=smoothstep(.44,.56,vSurf.x+(bn-.5)*.5+(bn2-.5)*.26);
float iceM=smoothstep(.3,.58,vSurf.y+(bn-.5)*.45);
float lakeM=smoothstep(.35,.7,vSurf.w);
// metres per pixel here: the 0.9 m beds are drawn while they are a few pixels thick, then hand over to 6 m bands
float alpinePx=length(fwidth(vTrack)),bedNear=1.0-smoothstep(.07,.26,alpinePx),bedFar=smoothstep(.07,.26,alpinePx)*(1.0-smoothstep(1.4,3.2,alpinePx));
// detail normal (finite differences in track space); past ~0.9 m per pixel the mipmapped noise is flat anyway, so it is not sampled
float e=.07,detK=1.0-smoothstep(.45,.9,alpinePx);
vec3 g=vec3(0.);
if(detK>.004){
 float sk=(1.0-rockM)*(1.0-lakeM);
 if(sk>.004){
  float s0=snowH(tp),sx=snowH(tp+vec2(e,0.)),sz=snowH(tp+vec2(0.,e));
  g+=vec3(sx-s0,0.,sz-s0)/e*.16*sk*detK; }
 if(rockM+iceM>.01){
  float bk=rockM*bedNear;
  float r0=rockH(vTrack,alpineN,bk),rx=rockH(vTrack+vec3(e,0.,0.),alpineN,bk),ry=rockH(vTrack+vec3(0.,e,0.),alpineN,bk),rz=rockH(vTrack+vec3(0.,0.,e),alpineN,bk);
  g+=vec3(rx-r0,ry-r0,rz-r0)/e*mix(.55,.22,iceM)*max(rockM,iceM)*detK;
 }
}
// banks: stronger wind sastrugi; trail grooves cut into the snow
float axT=abs(vTrack.x);
float floorF=smoothstep(.8,.94,alpineN.y)*(1.0-smoothstep(10.,14.,axT))*(1.0-rockM)*(1.0-lakeM)*step(.0001,vSurf.z);
float bankF=smoothstep(2.5,3.9,axT)*floorF;
vec2 calmUv=vClip.xy/vClip.w*.5+.5;
float calm=uCalmK*(1.0-smoothstep(.45,.85,length((calmUv-uCalm.xy)/max(uCalm.zw,vec2(1e-3)))));
float sT=-tp.y;
// wind ripples (sastrugi) across the route; fade before they alias
if(floorF>.01){
  float ph=sT*1.85+(n1(tp*vec2(.3,.12))*.7+n1(tp*vec2(.62,.25)+9.)*.3)*7.+vTrack.x*.22;
  float ripF=(1.0-smoothstep(.25,.9,fwidth(ph)))*floorF*(1.0-.8*calm);
  float saw=cos(ph)+.35*cos(2.*ph);
  g.z-=saw*1.85*.024*ripF;
  float ph2=sT*.62+n1(tp*vec2(.21,.09)+4.)*5.+vTrack.x*.35;
  g.z-=(cos(ph2)+.3*cos(2.*ph2))*.62*.05*(1.0-smoothstep(.3,.9,fwidth(ph2)))*floorF*(1.0-.6*calm);
  // sastrugi: sharp wind-carved ridges ~1.1 m apart, 2-3 cm high, in patches;
  // they only resolve close to the viewer, so they texture the bottom of the frame
  float ph3=sT*5.6+(n1(tp*vec2(.55,.3)+2.)*.7+n1(tp*vec2(1.3,.7))*.3)*9.+vTrack.x*(.6+.4*n1(tp*.2));
  float f3=(1.0-smoothstep(.25,.8,fwidth(ph3)))*floorF*(1.0-.6*calm)*(.35+.65*smoothstep(.3,.62,n1(tp*vec2(.25,.12)+11.)));
  float dh3=cos(ph3)+.7*cos(2.*ph3)+.36*cos(3.*ph3);
  g.z-=dh3*5.6*.021*f3; }
float trailD=0.;
float catD=0.;
if(floorF>.01&&axT<1.75){
 float cf=1.-smoothstep(.3,.9,fwidth(sT/.21));
 float c0=catTrack(tp,cf),cx=catTrack(tp+vec2(e,0.),cf),cz=catTrack(tp+vec2(0.,e),cf);
 g+=vec3(cx-c0,0.,cz-c0)/e*floorF*(1.-.55*calm);
 catD=clamp(-c0/.022,0.,1.)*floorF;
}
if(floorF>.01&&axT>2.6&&axT<5.2){
 trailD=trailDepth(tp)*floorF;
 float tx=trailDepth(tp+vec2(e,0.)),tz=trailDepth(tp+vec2(0.,e));
 g-=vec3(tx-trailD,0.,tz-trailD)/e*.045*floorF;
}
if(bankF>.01){ float s0=snowH(tp*1.7),sx=snowH(tp*1.7+vec2(e,0.)),sz=snowH(tp*1.7+vec2(0.,e)); g+=vec3(sx-s0,0.,sz-s0)/e*.1*bankF*(1.0-.7*calm); }
g*=uDetail;
vec3 alpineWN=normalize(alpineN-(g-alpineN*dot(g,alpineN)));
// rock, ice and lake are only worked out where they show: most of the frame is plain snow
float ledge=0.,lakeSnow=0.,faceX=(vTrack.x+vTrack.z)*.7;
vec3 snowCol=vec3(.855,.88,.915)*(.955+.06*n1(tp*3.7));
vec3 alpineCol=snowCol;
if(rockM+iceM>.004){
 // snow lies where the surface faces the sky, and along the step at the top of each bed
 ledge=smoothstep(.58,.68,alpineWN.y+(fbm3(vTrack.xz*2.3+vTrack.y)-.5)*.45);
 if(rockM>.004){
  float bedP=bedPhase(vTrack),bed=fract(bedP),bedId=floor(bedP),bedTone=n1(vec2(bedId*7.31,.5)),steepAll=1.0-smoothstep(.45,.8,alpineN.y),steep=steepAll*bedNear,steepFar=steepAll*bedFar;
  float bedP2=bedPhase(vTrack*.17+vec3(7.,3.,0.)),bed2=fract(bedP2),bedTone2=n1(vec2(floor(bedP2)*7.31,.5));
  ledge=max(ledge,smoothstep(.74,.8,bed)*(1.0-smoothstep(.94,1.,bed))*smoothstep(.47,.56,n1(vec2(faceX*1.7,bedId*5.7))*.7+bn2*.3)*steep*.94);
  // each bed has its own tone; a dark seam under it, joints across it
  float seam=smoothstep(0.,.07,bed),joint=smoothstep(.05,0.,abs(fract(faceX*.5+bedTone*9.+n1(vec2(faceX*.35,bedId*3.1))*.6)-.5))*steep;
  vec3 rockCol=mix(vec3(.060,.066,.076),vec3(.185,.178,.170),mix(bedTone,bedTone2,bedFar)*.55+fbm3(vec2(faceX*1.3,vTrack.y*3.1)+tp*.4)*.45);
  rockCol*=mix(.42,1.,mix(1.,seam,steep))*(1.0-joint*.55)*mix(1.,mix(.72,1.,smoothstep(0.,.3,bed2)),steepFar);
  rockCol=mix(rockCol,vec3(.115,.088,.062),smoothstep(.62,.8,n1(tp*.9+vTrack.y*.4))*.35);
  // broken rock close up: grit, and fracture lines where two blocks meet (both fade before they alias)
  vec2 rp=tp*1.7+vTrack.y*vec2(1.1,1.5); float near=1.0-smoothstep(.12,.5,fwidth(rp.x)+fwidth(rp.y));
  if(near>.004)rockCol*=mix(1.,.7+.6*fbm3(rp*3.4),near)*mix(1.,.45+.55*smoothstep(0.,.045,abs(n1(rp)-.5))*smoothstep(0.,.06,abs(n1(rp*2.3+5.1)-.5)),near);
  alpineCol=mix(snowCol,mix(rockCol,snowCol*.97,ledge*.92),rockM);
 }
 if(iceM>.004){
  vec3 iceCol=mix(vec3(.2,.37,.49),vec3(.56,.71,.81),smoothstep(.25,.85,fbm3(vec2(vTrack.x*.4+vTrack.z*.4,vTrack.y*.12))));
  // glacier ice shows through wind-packed snow in long bands across the slope, not in blots
  float iceSnow=max(ledge,smoothstep(.36,.62,fbm3(vec2(faceX*.22,vTrack.y*1.25))*.75+bn*.25));
  alpineCol=mix(alpineCol,mix(iceCol,snowCol,iceSnow*.86),iceM*(1.0-rockM*.5));
 }
}
if(lakeM>.004){
 float crack=1.0-smoothstep(.0,.035,abs(n1(tp*.55)-.5)*(.6+fbm3(tp*2.)));
 vec3 lakeCol=mix(vec3(.065,.15,.21),vec3(.22,.38,.47),fbm3(tp*.35))+crack*vec3(.55,.62,.66);
 lakeSnow=smoothstep(.58,.72,fbm3(tp*.6+3.));
 alpineCol=mix(alpineCol,mix(lakeCol,snowCol,lakeSnow),lakeM);
}
// compacted snow in the trail grooves reads cooler and darker
alpineCol*=mix(vec3(1.),vec3(.78,.85,.95),clamp(trailD,0.,1.)*.75*(1.0-calm));
alpineCol*=mix(vec3(1.),vec3(.86,.9,.97),catD*(1.0-.5*calm));
// wind-scoured bank patches: frozen soil, gravel and dead grass break through
float gm=vGround*floorF*(1.0-calm);
float groundM=0.;
if(gm>.003){
 float edge=gm+(n1(tp*2.3)-.5)*.3+(n1(tp*8.7)-.5)*.16;
 float bare=smoothstep(.22,.5,edge);
 float straw=n1(vec2(tp.x*13.,tp.y*4.))*.65+n1(tp*37.)*.35;
 vec3 grass=mix(vec3(.10,.078,.048),vec3(.29,.225,.135),smoothstep(.3,.8,straw));
 grass=mix(grass,vec3(.055,.052,.05),smoothstep(.8,.93,n1(tp*5.3+5.))*.7);
 float dust=smoothstep(.42,.75,n1(tp*14.+2.))*(1.-bare*.55);
 groundM=bare*(1.-dust*.8);
 alpineCol=mix(alpineCol,grass,groundM);
 alpineCol*=1.-.06*smoothstep(.05,.22,edge)*(1.-bare);
}
float ao=vSurf.z;
alpineCol*=mix(vec3(.74,.84,.98),vec3(1.),ao);
diffuseColor.rgb=alpineCol;
`)
   .replace('#include <roughnessmap_fragment>',`float roughnessFactor=mix(mix(mix(.8,.93,rockM*(1.0-ledge)),.36,iceM),.97,groundM);roughnessFactor=mix(roughnessFactor,.09,lakeM*(1.0-lakeSnow));`)
   .replace('#include <normal_fragment_maps>',`normal=normalize((viewMatrix*vec4(alpineWN,0.)).xyz);`);
 };
 m.customProgramCacheKey=()=>'snow-terrain-r27c';
 return m;
}
