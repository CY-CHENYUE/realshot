import * as T from 'three';

// One manufacturing language: enamel over steel, exposed machined edges,
// seals, and small instrument emitters. UVs supplied by the scene are metres.
export function createIndustrialMaterials({combatReadability=true}={}){
 const textures=new Set(),materials={};let ready=false,disposed=false;
 const noise=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 function finish(kind){
  const n=256,heights=new Float32Array(n*n),rough=new Uint8Array(n*n*4),normal=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const grain=noise(x,y),brushed=.5+.5*Math.sin(y*1.71+noise(0,y)*.45),fine=.5+.5*Math.sin(y*39+x*.17);
   heights[y*n+x]=kind==='alloy'?brushed*.035+fine*.008+grain*.004:grain*.016;
   const value=kind==='alloy'?.72+(brushed-.5)*.16:.86+(grain-.5)*.055;
   const i=(y*n+x)*4;rough[i]=rough[i+1]=rough[i+2]=Math.round(value*255);rough[i+3]=255;
  }
  const at=(x,y)=>heights[((y+n)%n)*n+(x+n)%n];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=-(at(x+1,y)-at(x-1,y)),b=-(at(x,y+1)-at(x,y-1)),l=Math.hypot(a,b,1),i=(y*n+x)*4;normal[i]=(a/l*.5+.5)*255;normal[i+1]=(b/l*.5+.5)*255;normal[i+2]=(1/l*.5+.5)*255;normal[i+3]=255;}
  const tex=data=>{const t=new T.DataTexture(data,n,n);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(3,3);t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.anisotropy=4;t.needsUpdate=true;textures.add(t);return t;};return {normalMap:tex(normal),roughnessMap:tex(rough)};
 }
 const coat=finish('coat'),metal=finish('alloy');
 const make=(key,color,metalness,roughness,more={})=>{const m=new T.MeshPhysicalMaterial({color,metalness,roughness,...more});m.name='Industrial_'+key;materials[key]=m;return m;};
 make('shell','#a8afa5',.10,.64,{...coat,normalScale:new T.Vector2(.24,.24),clearcoat:.07,clearcoatRoughness:.55});
 make('slate',combatReadability?'#6c8185':'#4b6264',.13,.59,{...coat,normalScale:new T.Vector2(.20,.20)});
 make('alloy','#718185',.91,.46,{...metal,normalScale:new T.Vector2(.26,.26)});
 make('graphite',combatReadability?'#3f505b':'#26343b',combatReadability?.18:.52,.58,{...coat,normalScale:new T.Vector2(.16,.16)});
 make('copper','#97744b',.77,.43,{...metal,normalScale:new T.Vector2(.15,.15)});
 make('rubber','#182326',0,.87,{...coat,normalScale:new T.Vector2(.12,.12)});
 make('caution',combatReadability?'#b09b67':'#b97935',.06,.65,{...coat,normalScale:new T.Vector2(.12,.12)});
 make('deck','#77827c',.52,.72,{normalScale:new T.Vector2(.30,.30)});
 make('signal','#a2b6b0',.2,.32,{emissive:'#b6c4ae',emissiveIntensity:.32});
 make('glass','#22434a',.45,.20,{clearcoat:.7,clearcoatRoughness:.12});
 for(const key of ['shell','slate','alloy','graphite']){
  const material=materials[key];material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vIndustryN;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvIndustryN=normalize(normalMatrix*objectNormal);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vIndustryN;').replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nfloat industrialEdge=smoothstep(.028,.18,length(fwidth(normalize(vIndustryN))));\nroughnessFactor=clamp(roughnessFactor-industrialEdge*.06,.21,.95);`);
  };material.customProgramCacheKey=()=>`industrial-surface-v1-${key}`;
 }
 async function prepare(){
  if(disposed)throw new Error('Industrial materials disposed');const loader=new T.TextureLoader();
  await Promise.all([['map','deck-albedo.jpg'],['normalMap','deck-normal.jpg'],['roughnessMap','deck-roughness.jpg'],['metalnessMap','deck-metalness.jpg']].map(async([slot,file])=>{const t=await loader.loadAsync('assets/hangar/textures/'+file);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(.5,.5);t.anisotropy=8;t.colorSpace=slot==='map'?T.SRGBColorSpace:T.NoColorSpace;textures.add(t);if(disposed)t.dispose();else materials.deck[slot]=t;}));
  if(disposed)return {ready:false};materials.deck.needsUpdate=true;ready=true;return {ready:true};
 }
 return {materials,prepare,inspection:()=>({source:'New local original industrial PBR family; Poly Haven CC0 metal_plate_02 maps on bounded real deck only',deck:{ready,metersPerTile:2,license:'CC0',source:'https://polyhaven.com/a/metal_plate_02'},families:Object.fromEntries(Object.entries(materials).map(([key,m])=>[key,{name:m.name,color:m.color.getHexString(),metalness:m.metalness,roughness:m.roughness,normal:!!m.normalMap,roughnessMap:!!m.roughnessMap}]))}),dispose(){if(disposed)return;disposed=true;for(const m of Object.values(materials))m.dispose();for(const t of textures)t.dispose();}};
}
