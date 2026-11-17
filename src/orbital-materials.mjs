import * as T from 'three';

// Newly authored material families for the orbital environment. UVs are in
// metres, not stretched once per object. The optical opening is empty space.
export function createOrbitalMaterials(){
 const textures=new Set();
 const grain=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);};
 function surface(kind){
  const n=256,height=new Float32Array(n*n),rough=new Uint8Array(n*n*4),normal=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const g=grain(x,y),brush=.5+.5*Math.sin(y*1.83+grain(0,y)*.8);
   height[y*n+x]=kind==='alloy'?g*.035+brush*.08:g*.10;
   const r=kind==='alloy'?.78+(brush-.5)*.14+(g-.5)*.04:.91+(g-.5)*.09;
   const i=(y*n+x)*4;rough[i]=rough[i+1]=rough[i+2]=Math.round(r*255);rough[i+3]=255;
  }
  const at=(x,y)=>height[((y+n)%n)*n+(x+n)%n];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const nx=-(at(x+1,y)-at(x-1,y)),ny=-(at(x,y+1)-at(x,y-1)),len=Math.hypot(nx,ny,1),i=(y*n+x)*4;
   normal[i]=Math.round((nx/len*.5+.5)*255);normal[i+1]=Math.round((ny/len*.5+.5)*255);normal[i+2]=Math.round((1/len*.5+.5)*255);normal[i+3]=255;
  }
  const tex=data=>{const t=new T.DataTexture(data,n,n,T.RGBAFormat);t.colorSpace=T.NoColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(4,4);t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.anisotropy=4;t.needsUpdate=true;textures.add(t);return t;};
  return {roughnessMap:tex(rough),normalMap:tex(normal)};
 }
 const coat=surface('coat'),metal=surface('alloy');
 const physical=(name,params)=>{const m=new T.MeshPhysicalMaterial(params);m.name=`Orbital / ${name}`;return m;};
 const materials={
  shell:physical('ceramic enamel',{color:'#e5e9e5',metalness:.045,roughness:.46,clearcoat:.22,clearcoatRoughness:.42,...coat,normalScale:new T.Vector2(.28,.28)}),
  alloy:physical('machined titanium',{color:'#74878a',metalness:.94,roughness:.32,...metal,normalScale:new T.Vector2(.38,.38)}),
  graphite:physical('recess and gasket',{color:'#24393e',metalness:.16,roughness:.74}),
  copper:physical('anodized warm metal',{color:'#b99b70',metalness:.86,roughness:.32,...metal,normalScale:new T.Vector2(.22,.22)}),
  signal:physical('bounded instrument emitter',{color:'#a9d2ce',metalness:.25,roughness:.28,emissive:'#5eaca8',emissiveIntensity:.55}),
  rubber:physical('flexible polymer',{color:'#27383b',metalness:0,roughness:.89,...coat,normalScale:new T.Vector2(.1,.1)}),
  opticalWhite:new T.MeshBasicMaterial({color:'#ffffff',toneMapped:false})
 };
 // Subtle edge exposure lives on real curved/bevelled surfaces. No global
 // bottom-dirt mask is used: these are suspended clean-room components.
 for(const key of ['shell','alloy']){
  const m=materials[key];
  m.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vOrbitalN;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvOrbitalN=normalize(normalMatrix*objectNormal);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vOrbitalN;').replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    float orbitalBevel=smoothstep(.035,.19,length(fwidth(normalize(vOrbitalN))));
    roughnessFactor=clamp(roughnessFactor-orbitalBevel*${key==='shell'?'.025':'.055'},.17,.95);`);
  };
  m.customProgramCacheKey=()=>`orbital-family-v1-${key}`;
 }
 let disposed=false;
 return {materials,inspection:()=>({source:'New local procedural PBR material families; no old station helper or downloaded maps',metersPerTile:.25,families:Object.fromEntries(Object.entries(materials).map(([k,m])=>[k,{type:m.type,metalness:m.metalness,roughness:m.roughness,normal:!!m.normalMap,roughnessMap:!!m.roughnessMap}]))}),dispose(){if(disposed)return;disposed=true;for(const m of Object.values(materials))m.dispose();for(const t of textures)t.dispose();}};
}
