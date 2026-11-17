import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {mulberry,clamp,lerp,smooth} from './snow-noise.mjs';

// r25 spruce. The r19 crown was a stack of solid jagged cones, every triangle
// carrying its own random colour and flat normal, so up close it read as a
// faceted low-poly prop. Shipped shooters build conifers from alpha-cut bough
// cards around a dark core instead: the silhouette breaks into needles, light
// passes between the boughs, and the crown shades as one volume because the
// card normals are bent towards the crown's cone. Here every bough is a
// drooping card folded along its rib (an inverted V, so it still shows area
// from the side), cut by a procedural needle texture. Snow sits on the upward
// faces only: a per-vertex load times a clump noise in the texture fills the
// gaps between needles with white pillows that stop at the bough outline.
//
// Texture channels (data, not colour): R needle shade, G bough hull (1 inside
// the frond outline), B snow clump noise, A needle coverage.

const TEX_W=512,TEX_H=256;

export function branchTextureData(seed=5){
 const rand=mulberry(seed),W=TEX_W,H=TEX_H,shade=new Float32Array(W*H),cov=new Float32Array(W*H);
 const mid=H/2;
 // frond half-width (pixels) along u: narrow at the trunk, widest past the middle, pointed tip
 const hw=u=>H*.47*Math.pow(Math.sin(Math.PI*Math.pow(clamp(u,0,1),.72)),.85);
 const stamp=(x,y,r,s)=>{
  const x0=Math.max(0,Math.floor(x-r-1)),x1=Math.min(W-1,Math.ceil(x+r+1)),y0=Math.max(0,Math.floor(y-r-1)),y1=Math.min(H-1,Math.ceil(y+r+1));
  for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++){
   const a=clamp(r+.5-Math.hypot(i+.5-x,j+.5-y),0,1);if(a<=0)continue;
   const k=j*W+i;cov[k]=cov[k]+a*(1-cov[k]);shade[k]=lerp(shade[k],s,a);
  }
 };
 const stroke=(x0,y0,x1,y1,r0,r1,s0,s1)=>{const n=Math.ceil(Math.hypot(x1-x0,y1-y0)/.6)+1;for(let i=0;i<=n;i++){const t=i/n;stamp(lerp(x0,x1,t),lerp(y0,y1,t),lerp(r0,r1,t),lerp(s0,s1,t));}};
 // needles along a twig, pointing forward, alternately to each side; the
 // under layer is drawn first and darker so the frond has depth
 const needles=(x0,y0,x1,y1,len0,len1,bright,layer)=>{
  const dx=x1-x0,dy=y1-y0,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,step=layer?1.6:2.4;
  for(let d=0;d<L;d+=step*(.8+rand()*.4)){
   const t=d/L,len=lerp(len0,len1,t)*(.75+rand()*.45),px=x0+ux*d,py=y0+uy*d;
   for(const side of [-1,1]){
    const ang=side*(.85+rand()*.45)*(layer?1:1.25),ca=Math.cos(ang),sa=Math.sin(ang);
    const nx=ux*ca-uy*sa,ny=ux*sa+uy*ca,ex=px+nx*len,ey=py+ny*len;
    if(Math.abs(ey-mid)>hw(ex/W)+2)continue;
    const b=bright*(layer?.78+rand()*.3:.42+rand()*.18);
    stroke(px,py,ex,ey,layer?1.25:1.05,.55,b*.62,b);
   }
  }
 };
 // twig skeleton: the main rib plus forward-angled side twigs, both sides
 const twigs=[];
 for(let u=.05;u<.93;u+=.05+rand()*.025)for(const side of [-1,1]){
  const uu=u+(rand()-.5)*.02,x0=uu*W,reach=hw(uu+.07)*(.82+rand()*.16),ang=lerp(.75,1.05,rand());
  const ex=x0+reach/Math.tan(ang),ey=mid+side*reach;
  twigs.push([x0,mid,Math.min(W-3,ex),ey,lerp(1.3,.7,uu)]);
 }
 // under layer (dark), twigs, top layer (lit)
 needles(4,mid,W-4,mid,15,7,.75,0);
 for(const [x0,y0,x1,y1] of twigs)needles(x0,y0,x1,y1,12,6,.7,0);
 for(const [x0,y0,x1,y1,r] of twigs)stroke(x0,y0,x1,y1,r,.5,.24,.3);
 stroke(2,mid,W-3,mid,2.6,.8,.2,.28);
 for(const [x0,y0,x1,y1] of twigs)needles(x0,y0,x1,y1,11,5,1,1);
 needles(6,mid,W-6,mid,13,6,1,1);
 // snow clump noise: soft blobs biased to the inner half of the frond
 const clump=new Float32Array(W*H);
 for(let b=0;b<70;b++){
  const u=.08+rand()*.84,cx=u*W,cy=mid+(rand()-.5)*1.3*hw(u),r=lerp(9,30,rand())*(1-.4*u),amp=.55+rand()*.6;
  const x0=Math.max(0,Math.floor(cx-3*r)),x1=Math.min(W-1,Math.ceil(cx+3*r)),y0=Math.max(0,Math.floor(cy-3*r)),y1=Math.min(H-1,Math.ceil(cy+3*r));
  for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++){const d2=((i-cx)**2+(j-cy)**2)/(r*r);clump[j*W+i]+=amp*Math.exp(-d2*1.4);}
 }
 const lattice=new Float32Array(4096).map(()=>rand());
 const lat=(x,y)=>lattice[((x&63)+((y&63)<<6))],vnoise=(x,y)=>{const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  return lerp(lerp(lat(x0,y0),lat(x0+1,y0),sx),lerp(lat(x0,y0+1),lat(x0+1,y0+1),sx),sy);};
 const data=new Uint8Array(W*H*4);
 for(let j=0;j<H;j++)for(let i=0;i<W;i++){
  const k=j*W+i,u=i/W,inside=hw(u)-Math.abs(j+.5-mid);
  const fine=.6*vnoise(i/7,j/7)+.4*vnoise(i/2.6+31,j/2.6+17);   // value noise (a sine weave here showed as moire rings on large faces)
  data[k*4]=Math.round(255*clamp(shade[k]));
  data[k*4+1]=Math.round(255*clamp(inside/14));
  data[k*4+2]=Math.round(255*clamp(clump[k]*.72+fine*.22));
  data[k*4+3]=Math.round(255*clamp(cov[k]));
 }
 return {data,width:W,height:H};
}

export function createBranchTexture(seed=5){
 const {data,width,height}=branchTextureData(seed);
 const tex=new T.DataTexture(data,width,height,T.RGBAFormat,T.UnsignedByteType);
 tex.name='spruce bough cards / procedural r25';
 tex.wrapS=T.RepeatWrapping;tex.wrapT=T.ClampToEdgeWrapping;
 tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=4;
 tex.needsUpdate=true;
 return tex;
}

// Unit-height spruce for instancing. Keeps the r19 crown envelope (tier
// radius .38·(1-.93f)^1.08+.035, tips to ~.5·width) so gameplay's crown boxes
// and walker columns still match the drawn tree.
function buildConifer(seed=1,{tiers=14,boughs=7,width=1,snowiness=.75,segments=4,core=true}={}){
 const rand=mulberry(seed),pos=[],nrm=[],col=[],uv=[],snow=[];
 const C=hex=>new T.Color(hex);
 const tints=[C('#1f3d2e'),C('#24432f'),C('#1a3529'),C('#2a4632')],deep=C('#183024'),bark=C('#1c1510');
 const UP=new T.Vector3(0,1,0),tmp=new T.Vector3(),tmp2=new T.Vector3();
 const envelope=f=>(.38*Math.pow(clamp(1-f*.93,0,1),1.08)+.035)*width;
 const coneNormal=(p,lift=.45)=>{tmp2.set(p.x,0,p.z);if(tmp2.lengthSq()<1e-8)tmp2.set(1,0,0);tmp2.normalize();return tmp2.clone().add(new T.Vector3(0,lift,0)).normalize();};
 const vert=(p,n,c,u,v,s)=>{pos.push(p.x,p.y,p.z);nrm.push(n.x,n.y,n.z);col.push(c.r,c.g,c.b);uv.push(u,v);snow.push(s);};
 // a triangle whose front face points up (the snow side); the vertex data are
 // [position, normal, colour, u, v, snow]
 const tri=(a,b,c)=>{
  tmp.subVectors(b[0],a[0]).cross(new T.Vector3().subVectors(c[0],a[0]));
  if(tmp.y<0){const t=b;b=c;c=t;}
  for(const q of [a,b,c])vert(...q);
 };
 // trunk: short tapered column under the lowest whorl
 {const seg=7,top=.5,r0=.03*width,r1=.012*width;
  for(let i=0;i<seg;i++){
   const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2,n0=new T.Vector3(Math.cos(a0),0,Math.sin(a0)),n1=new T.Vector3(Math.cos(a1),0,Math.sin(a1));
   const p00=n0.clone().multiplyScalar(r0),p10=n1.clone().multiplyScalar(r0),p11=n1.clone().multiplyScalar(r1).setY(top),p01=n0.clone().multiplyScalar(r1).setY(top);
   for(const [p,n,u,v] of [[p00,n0,0,0],[p11,n1,1,1],[p10,n1,1,0],[p00,n0,0,0],[p01,n0,0,1],[p11,n1,1,1]])vert(p,n,bark,u*.1,.5+v*.02,-1);
  }}
 // core: the body of the crown, opaque. r25 used one smooth cone here; from the roadside it read as a paper
 // cone with a few boughs stuck on. r27 stacks drooping skirts instead: each is a ring of lobes (the boughs
 // of one whorl grown together) tucked under the skirt above, with a dark underside, so the crown shows
 // layers, depth and a broken outline before a single card is drawn. Snow rides the middle of every lobe
 // (aSnow -1..-2 marks core vertices; the fraction is the load) and the needle texture breaks it into
 // pillows. One alpha-cut bough card then grows out of every lobe and every notch, from the pillow outward
 // past the skirt's edge: the cards are the needle fringe that hides the skirt's straight polygon rim.
 const N=Math.max(5,Math.round(tiers*.66)),span=.76/N*2.05,skirts=[];
 const radial=(a,r,y)=>new T.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
 for(let i=0;i<N;i++){
  const f=i/(N-1),yBot=lerp(.085,.86,Math.pow(f,.96)),yTop=Math.min(.985,yBot+span*lerp(1,.8,f)),rot=i*2.39996+rand()*.5;
  const lobes=f>.82?Math.max(4,boughs-2):f>.6?Math.max(5,boughs-1):boughs,seg=lobes*2;
  const eBot=envelope(clamp((yBot-.1)/.82,0,1)),eTop=envelope(clamp((yTop-.1)/.82,0,1));
  const load=snowiness*lerp(.66,1.05,f),tint=tints[i%tints.length].clone().multiplyScalar(lerp(.74,.98,f)),dark=deep.clone().multiplyScalar(lerp(.42,.6,f));
  const pts=[];
  for(let k=0;k<seg;k++){
   const lobe=k%2===0,j=rand(),j2=rand(),a=rot+(k+(rand()-.5)*.5)/seg*Math.PI*2;
   const rTip=eBot*(lobe?.84+j*.12:.58+j*.12),yTip=yBot-(lobe?.012+j2*.02:-.006)*width;
   const rTuck=Math.max(.012*width,eTop*.3),rMid=lerp(rTuck,rTip,.56),yMid=lerp(yTop,yTip,.5)+.02*width*(lobe?1:.5);
   pts.push({a,lobe,rTip,yTip,rTuck,rMid,yMid,sMid:clamp(load*(lobe?.8+j*.45:.6+j2*.3),0,1)});
  }
  skirts.push({f,yBot,yTop,seg,eBot,load,tint,dark,pts});
 }
 if(core){
  const topN=p=>coneNormal(p,1.05),underN=p=>{const n=coneNormal(p,0);n.y=-1.5;return n.normalize();};
  const triDown=(a,b,c)=>{tmp.subVectors(b[0],a[0]).cross(new T.Vector3().subVectors(c[0],a[0]));if(tmp.y>0){const t=b;b=c;c=t;}for(const q of [a,b,c])vert(...q);};
  for(const sk of skirts){
   const {seg,tint,dark,load}=sk,rings=[[],[],[],[]];   // tuck, pillow, tip, underside
   for(let k=0;k<=seg;k++){
    const q=sk.pts[k%seg],u=k/seg*3;
    const pT=radial(q.a,q.rTuck,sk.yTop),pM=radial(q.a,q.rMid,q.yMid),pE=radial(q.a,q.rTip,q.yTip),pU=radial(q.a,Math.max(.01*width,sk.eBot*.2),sk.yBot+span*.42);
    rings[0].push([pT,topN(pT),dark,u,.08,-1-load*.3]);
    rings[1].push([pM,topN(pM),tint,u,.5,-1-q.sMid]);
    rings[2].push([pE,topN(pE).lerp(coneNormal(pE,0),.35).normalize(),tint.clone().multiplyScalar(1.06),u,.92,-1-load*.22]);
    rings[3].push([pU,underN(pU),dark.clone().multiplyScalar(.7),u,.3,-1]);
   }
   for(let k=0;k<seg;k++){
    tri(rings[0][k],rings[0][k+1],rings[1][k+1]);tri(rings[0][k],rings[1][k+1],rings[1][k]);
    tri(rings[1][k],rings[1][k+1],rings[2][k+1]);tri(rings[1][k],rings[2][k+1],rings[2][k]);
    const e0=[rings[2][k][0],underN(rings[2][k][0]),dark,rings[2][k][3],.9,-1],e1=[rings[2][k+1][0],underN(rings[2][k+1][0]),dark,rings[2][k+1][3],.9,-1];
    triDown(e0,e1,rings[3][k+1]);triDown(e0,rings[3][k+1],rings[3][k]);
   }
  }
 }
 const coreEnd=pos.length/3;
 // boughs: one card per lobe and a shorter one per notch
 for(const sk of skirts)for(const q of sk.pts){
  const f=sk.f,dir=new T.Vector3(Math.cos(q.a),0,Math.sin(q.a)),side=new T.Vector3(-dir.z,0,dir.x);
  const rRoot=lerp(q.rTuck,q.rMid,.8),yRoot=lerp(sk.yTop,q.yMid,.8)+.006*width;
  const L=(q.rTip-rRoot)+sk.eBot*(q.lobe?.14+rand()*.11:.1+rand()*.1);   // tips stay inside .5 width: gameplay's crown boxes and walker columns
  const slope=Math.min(1.1,(q.yMid-q.yTip)/Math.max(1e-4,q.rTip-q.rMid))*lerp(.7,.9,rand()),droop=lerp(.16,.3,rand());
  const hw=L*lerp(.46,.6,rand()),tilt=lerp(.42,.7,rand()),roll=(rand()-.5)*.3;
  const tint=tints[Math.floor(rand()*tints.length)].clone().multiplyScalar(lerp(.86,1.14,rand())*lerp(.82,1,f));
  const bLoad=sk.load*(.7+rand()*.5);
  const ringPts=[];
  for(let i=0;i<=segments;i++){
   const s=i/segments,y=yRoot-L*(slope*s+droop*s*s);   // lies along the skirt, then hangs a little past its edge
   const rib=dir.clone().multiplyScalar(rRoot+L*s).setY(y);
   // the fold opens toward the tip; the near end stays narrow where it leaves the pillow
   const w=hw*smooth(0,.35,s)*.9+hw*.1,dl=Math.sin(tilt+roll)*w,dr=Math.sin(tilt-roll)*w;
   const left=rib.clone().addScaledVector(side,-Math.cos(tilt+roll)*w).add(new T.Vector3(0,-dl,0));
   const right=rib.clone().addScaledVector(side,Math.cos(tilt-roll)*w).add(new T.Vector3(0,-dr,0));
   ringPts.push({s,rib,left,right});
  }
  for(let i=0;i<segments;i++){
   const A=ringPts[i],B=ringPts[i+1];
   for(const [e0,e1,v0] of [[A.left,B.left,0],[A.right,B.right,1]]){
    // face normal of this half, bent toward the crown cone
    const fN=new T.Vector3().subVectors(B.rib,A.rib).cross(new T.Vector3().subVectors(e0,A.rib)).normalize();if(fN.y<0)fN.negate();
    const P=(p,s,v,edge)=>{
     const cn=coneNormal(p,.55),nn=fN.clone().multiplyScalar(.45).add(cn.multiplyScalar(.75)).normalize();
     const ao=lerp(.62,1,smooth(0,.55,s))*(edge?1:.92);
     const sn=bLoad*smooth(.02,.3,s)*(1-.6*s*s)*clamp((fN.y-.25)/.55);
     return [p,nn,tint.clone().multiplyScalar(ao),s,v,sn];
    };
    const a0=P(A.rib,A.s,.5,false),b0=P(B.rib,B.s,.5,false),a1=P(e0,A.s,v0,true),b1=P(e1,B.s,v0,true);
    tri(a0,b0,b1);tri(a0,b1,a1);
   }
  }
 }
 // leader: two crossed upright cards carrying the top of the crown
 {const base=.84,top=1.0,w=.06*width;
  for(const a of [0,Math.PI/2]){
   const sx=Math.cos(a)*w,sz=Math.sin(a)*w,n=new T.Vector3(-Math.sin(a),.3,Math.cos(a)).normalize(),c=tints[0];
   const p=[new T.Vector3(-sx,base,-sz),new T.Vector3(sx,base,sz),new T.Vector3(0,top,0)];
   // u runs up the leader (narrow at the attachment), v across
   for(const [q,u,v] of [[p[0],.08,0],[p[1],.08,1],[p[2],.97,.5]])vert(q,n,c,u,v,snowiness*.25);
  }}
 const geometry=(a=0,b=pos.length/3)=>{
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos.slice(a*3,b*3),3));g.setAttribute('normal',new T.Float32BufferAttribute(nrm.slice(a*3,b*3),3));
  g.setAttribute('color',new T.Float32BufferAttribute(col.slice(a*3,b*3),3));g.setAttribute('uv',new T.Float32BufferAttribute(uv.slice(a*2,b*2),2));g.setAttribute('aSnow',new T.Float32BufferAttribute(snow.slice(a,b),1));
  return g;
 };
 return {geometry,coreEnd,count:pos.length/3};
}

// One non-indexed geometry: trunk, dark core, bough cards and leader.
export function coniferGeometry(seed=1,options={}){return buildConifer(seed,options).geometry();}

// The same tree split for rendering (r25b). The trunk and dark core become an
// opaque mesh: it is the tree's shadow caster (the cards cast none, see
// createConiferShadowMaterial) and, drawn before the cards, it hides the
// boughs on the far side of the crown from the expensive card shader. Both
// parts are indexed so shared vertices are shaded once. Bough placement does
// not depend on `segments`, so a coarser LOD of the cards keeps every bough
// where it was; only the droop curve gets fewer joints.
export function coniferParts(seed=1,options={}){
 const b=buildConifer(seed,options);
 const index=g=>{const m=mergeVertices(g,1e-5);g.dispose();m.computeBoundingSphere();m.computeBoundingBox();return m;};
 return {core:index(b.geometry(0,b.coreEnd)),cards:index(b.geometry(b.coreEnd,b.count))};
}

// Instanced card material: same wind sway and far flattening as the r19
// flora material, plus the bough texture decode, top-face snow and coverage
// that holds up in the smaller mips (alpha is scaled by the estimated mip
// level so distant crowns don't thin out). Alpha to coverage gives soft
// needle edges under the 4x MSAA scene target.
//
// `cards` turns this into the opaque part for coniferParts().core: front faces
// only, no alpha test, sharing the cards' texture and uniforms (one uTime).
export function createConiferMaterial({name='snow-laden spruce / r25 bough cards',roughness=.86,envMapIntensity=.62,sway=.012,snowColor='#eef3f8',cards=null}={}){
 const map=cards?cards.map:createBranchTexture();
 const m=new T.MeshStandardMaterial({name,vertexColors:true,roughness,metalness:0,envMapIntensity,map,...(cards?{side:T.FrontSide}:{alphaTest:.5,alphaToCoverage:true,side:T.DoubleSide})});
 m.userData.uniforms=cards?cards.userData.uniforms:{uTime:{value:0},uFade:{value:new T.Vector2(118,166)},uSway:{value:sway},uSnowColor:{value:new T.Color(snowColor)},uAmbient:{value:4.8},uTrans:{value:.85},uDebug:{value:0},uSnowBias:{value:.3}};
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,m.userData.uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float uTime;uniform vec2 uFade;uniform float uSway;attribute float aSnow;varying float vSnow;`).replace('#include <begin_vertex>',`#include <begin_vertex>
float floraFlat=0.0;vec4 floraOrigin=vec4(0.0,0.0,0.0,1.0);
#ifdef USE_INSTANCING
{floraOrigin=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);floraFlat=smoothstep(uFade.x,uFade.y,-floraOrigin.z);
 float ph=floraOrigin.x*.37+floraOrigin.z*.21;float h=transformed.y*transformed.y;
 transformed.x+=sin(uTime*1.25+ph)*uSway*h;transformed.z+=cos(uTime*.93+ph*1.3)*uSway*.6*h;
 transformed*=1.0-floraFlat;}
#endif
vSnow=aSnow;`).replace('#include <project_vertex>',`vec4 mvPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
mvPosition=instanceMatrix*mvPosition;
#endif
mvPosition=modelMatrix*mvPosition;mvPosition.y=mix(mvPosition.y,mvPosition.y-(floraOrigin.y+1.6),floraFlat);
mvPosition=viewMatrix*mvPosition;gl_Position=projectionMatrix*mvPosition;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform vec3 uSnowColor;uniform float uAmbient,uTrans,uDebug,uSnowBias;varying float vSnow;`).replace('#include <map_fragment>',`vec4 cTx=texture2D(map,vMapUv);
vec2 cTs=vec2(textureSize(map,0)),cDx=dFdx(vMapUv*cTs),cDy=dFdy(vMapUv*cTs);
float cLod=max(0.,.5*log2(max(dot(cDx,cDx),dot(cDy,cDy))));
float cAlpha=cTx.a*(1.+cLod*.3),cShade=.32+.85*cTx.r,coniferSnow=0.;
if(vSnow<0.){cAlpha=1.;cShade=.55+.5*cTx.r;coniferSnow=smoothstep(.36-uSnowBias,.6-uSnowBias,(-vSnow-1.)*(.25+1.05*cTx.b));}
else{coniferSnow=smoothstep(.38-uSnowBias,.55-uSnowBias,vSnow*(.3+.95*cTx.b))*smoothstep(.15,.5,cTx.g);
 // from below a bough shows the snow load at its outer half, where the pillows overhang the needles
 if(!gl_FrontFacing)coniferSnow*=.75*smoothstep(.3,.75,vMapUv.x);}`).replace('#include <color_fragment>',`#include <color_fragment>
diffuseColor.rgb*=cShade;vec3 cNeedle=diffuseColor.rgb;
diffuseColor.rgb=mix(diffuseColor.rgb,uSnowColor*(.84+.16*cTx.b),coniferSnow);
diffuseColor.a=max(cAlpha,coniferSnow);`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.6,coniferSnow);`).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
// cards keep the crown normal on both faces: a bough seen from below shades with the crown, not black
#ifdef DOUBLE_SIDED
if(vSnow>=0.)normal*=faceDirection;
#endif
if(gl_FrontFacing)normal=normalize(mix(normal,normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz),coniferSnow*.65));`).replace('#include <aomap_fragment>',`#include <aomap_fragment>
// canopy light: snow-bounce ambient scatters between the needle layers (the scene's environment is kept
// low for the open snow), and sunlight comes through the needles toward the viewer
// (the boost belongs to the needles only: weighted by how much of the texel's albedo is needle, or the half-snowed
// rim of every pillow gets snow albedo times the needle boost and glows as a bright outline)
{float cLn=dot(cNeedle,vec3(.3333))*(1.-coniferSnow),cLs=dot(uSnowColor,vec3(.3))*coniferSnow;
 reflectedLight.indirectDiffuse*=(cLn*uAmbient+cLs)/max(cLn+cLs,1e-4);}
if(vSnow>=0.){
#if NUM_DIR_LIGHTS > 0
 vec3 cL=directionalLights[0].direction,cV=normalize(vViewPosition);
 float cThru=uTrans*(.25+.75*pow(saturate(dot(-cV,cL)),3.))*saturate(.4-.6*dot(normal,cL));
 // only the needles let light through: a half-snowed texel at a pillow's rim must not glow with the snow's albedo (it read as a bright speckle round every bough)
 totalEmissiveRadiance+=cNeedle*vec3(.9,1.08,.62)*directionalLights[0].color*cThru*(1.-coniferSnow)*(1.-coniferSnow);
#endif
}
if(uDebug>.5){reflectedLight.directDiffuse=reflectedLight.indirectDiffuse=reflectedLight.directSpecular=reflectedLight.indirectSpecular=vec3(0.);totalEmissiveRadiance=vec3(1.,0.,1.);}`);
 };
 m.customProgramCacheKey=()=>cards?'snow-conifer-r27-core':'snow-conifer-r27c';
 if(!cards)m.addEventListener('dispose',()=>map.dispose());
 return m;
}

// Shadow caster for the core part. Alpha-tested cards in the 3072 sun map cost
// about as much as the whole terrain pass at the 2000x1150 canvas, so the cards
// cast nothing and the core casts the crown: its rings sit at .74-.46 of the
// crown envelope, and this depth pass widens them back to .85 of it, which
// keeps the old solid-crown shadow on the snow and on the neighbouring trees.
export function createConiferShadowMaterial(){
 const m=new T.MeshDepthMaterial();
 m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
transformed.xz*=1.05;`);};
 m.customProgramCacheKey=()=>'snow-conifer-r27-shadow';
 return m;
}
