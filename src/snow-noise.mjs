import * as T from 'three';

// Deterministic noise shared by the CPU terrain builder and the GPU detail
// shaders. Everything in the r19 snow world is generated from these functions;
// there is no downloaded texture or commercial asset in the environment.

export function mulberry(seed=1){
 let s=seed>>>0;
 return ()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

export const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

// 2D gradient noise in roughly [-1,1].
export function createNoise(seed=1337){
 const rand=mulberry(seed),perm=new Uint8Array(512),gx=new Float32Array(256),gy=new Float32Array(256);
 const p=Array.from({length:256},(_,i)=>i);
 for(let i=255;i>0;i--){const j=Math.floor(rand()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
 for(let i=0;i<512;i++)perm[i]=p[i&255];
 for(let i=0;i<256;i++){const a=rand()*Math.PI*2;gx[i]=Math.cos(a);gy[i]=Math.sin(a);}
 function noise(x,y){
  const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,X=xi&255,Y=yi&255;
  const u=xf*xf*xf*(xf*(xf*6-15)+10),v=yf*yf*yf*(yf*(yf*6-15)+10);
  const a=perm[X+perm[Y]],b=perm[X+1+perm[Y]],c=perm[X+perm[Y+1]],d=perm[X+1+perm[Y+1]];
  const n00=gx[a]*xf+gy[a]*yf,n10=gx[b]*(xf-1)+gy[b]*yf,n01=gx[c]*xf+gy[c]*(yf-1),n11=gx[d]*(xf-1)+gy[d]*(yf-1);
  const nx0=n00+(n10-n00)*u,nx1=n01+(n11-n01)*u;
  return (nx0+(nx1-nx0)*v)*1.42;
 }
 // fbm in [0,1]
 function fbm(x,y,octaves=4){
  let sum=0,amp=.5,norm=0;
  for(let i=0;i<octaves;i++){sum+=amp*noise(x,y);norm+=amp;const nx=x*1.6+y*1.2+17.3,ny=-x*1.2+y*1.6+9.1;x=nx;y=ny;amp*=.5;}
  return clamp(sum/norm*.5+.5);
 }
 // Ridged multifractal in [0,1]: sharp crests for mountain ridgelines.
 function ridged(x,y,octaves=5){
  let sum=0,amp=.5,weight=1,norm=0;
  for(let i=0;i<octaves;i++){
   let n=1-Math.abs(noise(x,y));n*=n;n*=weight;weight=clamp(n*1.6);
   sum+=n*amp;norm+=amp;const nx=x*1.9+y*1.1+11.7,ny=-x*1.1+y*1.9+4.3;x=nx;y=ny;amp*=.5;
  }
  return clamp(sum/norm);
 }
 return {noise,fbm,ridged,random:rand};
}

// The GPU twin: per-texel random values sampled with smoothed bilinear weights
// (value noise), like the reference game's tNoise lookup. Four independent
// channels let a shader draw several unrelated patterns from one fetch.
export function createNoiseTexture(seed=9173,size=256){
 const rand=mulberry(seed),data=new Uint8Array(size*size*4);
 for(let i=0;i<data.length;i++)data[i]=Math.floor(rand()*256);
 const tex=new T.DataTexture(data,size,size,T.RGBAFormat,T.UnsignedByteType);
 tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;/* mips: without them every noise threshold on a far slope aliased into a halftone speckle */tex.colorSpace=T.NoColorSpace;tex.needsUpdate=true;tex.name='snow-r19 / value noise';
 return tex;
}

export const GLSL_NOISE=`
uniform sampler2D uNoise;
vec4 n4(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return texture2D(uNoise,(i+f+0.5)/256.0); }
float n1(vec2 p){ return n4(p).r; }
float fbm3(vec2 p){ float a=.5,s=0.; for(int i=0;i<3;i++){ s+=a*n1(p); p=mat2(1.6,1.2,-1.2,1.6)*p+17.3; a*=.5; } return s/.875; }
float fbm5(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n1(p); p=mat2(1.6,1.2,-1.2,1.6)*p+17.3; a*=.5; } return s/.96875; }
`;
