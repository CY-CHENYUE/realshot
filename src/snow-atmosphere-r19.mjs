import * as T from 'three';

// Alpine light design for a white transparent display.
//  - The sky is the panel's white (transparent) light, not a painted backdrop.
//  - A low warm sun from back-left rakes the slopes: long cool-blue shadows on
//    snow, warm lit crests, dark rock reading as the opaque ink on the panel.
//  - Aerial perspective is height-aware: valley air is thick, peaks stay crisp;
//    near haze is steel blue, far haze goes white so the horizon dissolves into
//    the display's own light (the reference game's horizon-colour fog idea).
export const SUN_DIRECTION=new T.Vector3(-.349,.515,-.783).normalize(); // points toward the sun
export const SUN_COLOR=new T.Color(1,.93,.84);
export const SKY_COLOR=new T.Color('#b3cbe3');
export const BOUNCE_COLOR=new T.Color('#eef3f6');

const v3=v=>`vec3(${v.map(n=>n.toFixed(5)).join(',')})`;
// Linear scene value that the snow grade maps to display white. Lit snow sits
// just below it; far haze is slightly above it, so the horizon becomes the
// panel's own white light (transparent) with no seam against the sky.
export const WHITE_POINT=1.42;
export const HAZE={
 density:.0068,heightScale:26,
 near:[.70,.80,.93],far:[1.46,1.48,1.52],sunTint:[.55,.34,.12],
 nearDistance:24,farDistance:240,
};

// Live atmosphere (r26). The haze used to be compiled into the fog chunk as constants, which fixed the
// time of day for every page. The same numbers now live in shared typed arrays that every fog-enabled
// program reads as uniforms: three clones Color/Vector uniforms per material but passes typed arrays by
// reference, so writing these arrays re-lights the haze of the whole scene on the next frame with no
// recompilation. The defaults are the r19 constants, so pages that never touch them look as before.
export const ATMOSPHERE={
 sun:new Float32Array(SUN_DIRECTION.toArray()),near:new Float32Array(HAZE.near),far:new Float32Array(HAZE.far),tint:new Float32Array(HAZE.sunTint),
 // density, height scale, near distance, far distance
 params:new Float32Array([HAZE.density,HAZE.heightScale,HAZE.nearDistance,HAZE.farDistance]),
 // x: strength of the tight forward-scatter lobe around the sun (0 in r19)
 extra:new Float32Array([0,0]),
};
const hazeUniforms=()=>({alpSun:{value:ATMOSPHERE.sun},alpNear:{value:ATMOSPHERE.near},alpFar:{value:ATMOSPHERE.far},alpTint:{value:ATMOSPHERE.tint},alpParams:{value:ATMOSPHERE.params},alpExtra:{value:ATMOSPHERE.extra}});

let installed=false;
// Replace three's fog chunks once for this page. Every material that opts into
// fog (terrain, trees, enemies, effects) receives the same aerial perspective in
// linear HDR before the final tone mapping pass.
export function installAlpineFog(){
 if(installed)return;installed=true;
 Object.assign(T.UniformsLib.fog,hazeUniforms());
 for(const lib of Object.values(T.ShaderLib))if(lib.uniforms?.fogColor)Object.assign(lib.uniforms,hazeUniforms());
 T.ShaderChunk.fog_pars_vertex=`#ifdef USE_FOG
 varying float vFogDepth;
 varying vec3 vFogWorld;
#endif`;
 // World position from the view-space position: valid for meshes, instances,
 // batches, points and sprites alike (all built-ins define mvPosition here).
 T.ShaderChunk.fog_vertex=`#ifdef USE_FOG
 vFogWorld=transpose(mat3(viewMatrix))*(mvPosition.xyz-viewMatrix[3].xyz);
 vFogDepth=-mvPosition.z;
#endif`;
 T.ShaderChunk.fog_pars_fragment=`#ifdef USE_FOG
 uniform vec3 fogColor;
 uniform vec3 alpSun,alpNear,alpFar,alpTint;
 uniform vec4 alpParams;
 uniform vec2 alpExtra;
 varying float vFogDepth;
 varying vec3 vFogWorld;
 #ifdef FOG_EXP2
  uniform float fogDensity;
 #else
  uniform float fogNear;
  uniform float fogFar;
 #endif
 vec3 alpineHaze(vec3 color,vec3 worldPos){
  vec3 rd=worldPos-cameraPosition;float dist=length(rd);rd/=max(dist,1e-4);
  float H=alpParams.y;
  float h0=max(cameraPosition.y,-2.0),h1=max(worldPos.y,-2.0),dh=h1-h0;
  float od=abs(dh)>.02?dist*H*(exp(-h0/H)-exp(-h1/H))/dh:dist*exp(-h0/H);
  #ifdef FOG_EXP2
   float strength=fogDensity;
  #else
   float strength=1.0;
  #endif
  float haze=1.0-exp(-od*alpParams.x*strength);
  float mu=max(dot(rd,alpSun),0.0);
  vec3 hc=mix(alpNear,alpFar,smoothstep(alpParams.z,alpParams.w,dist));
  hc+=alpTint*(pow(mu,5.0)*.32+pow(mu,48.0)*alpExtra.x);
  return mix(color,hc*fogColor,haze);
 }
#endif`;
 T.ShaderChunk.fog_fragment=`#ifdef USE_FOG
 gl_FragColor.rgb=alpineHaze(gl_FragColor.rgb,vFogWorld);
#endif`;
}

// A small procedural sky for image-based lighting: blue zenith, white horizon,
// bright snow below. Generated once; no HDR file is needed for the snow world.
export function createAlpineEnvironment(renderer){
 const sky=new T.Scene();
 const mat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{uSun:{value:SUN_DIRECTION.clone()}},
  vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 vDir;uniform vec3 uSun;void main(){
   float y=vDir.y;vec3 zen=vec3(.42,.58,.82),hor=vec3(1.05,1.08,1.12),gnd=vec3(.92,.95,.98);
   vec3 c=y>0.?mix(hor,zen,pow(clamp(y,0.,1.),.55)):mix(hor,gnd,clamp(-y*4.,0.,1.));
   float mu=max(dot(normalize(vDir),uSun),0.);c+=vec3(1.,.82,.6)*(pow(mu,900.)*40.+pow(mu,12.)*.35);
   gl_FragColor=vec4(c,1.);}`});
 sky.add(new T.Mesh(new T.SphereGeometry(10,48,24),mat));
 const pmrem=new T.PMREMGenerator(renderer),target=pmrem.fromScene(sky,.02);
 pmrem.dispose();mat.dispose();sky.children[0].geometry.dispose();
 return target.texture;
}

// Light rig shared by window and box surfaces.
export function createAlpineLights(){
 const group=new T.Group();group.name='alpine light rig / low warm sun + sky';
 const sun=new T.DirectionalLight(SUN_COLOR,3.4);sun.name='sun / back-left low';
 const target=new T.Object3D();target.position.set(1,0,-14);
 sun.position.copy(target.position).addScaledVector(SUN_DIRECTION,90);sun.target=target;
 sun.castShadow=true;sun.shadow.mapSize.set(3072,3072);
 Object.assign(sun.shadow.camera,{left:-50,right:50,top:62,bottom:-40,near:10,far:200});
 sun.shadow.bias=-.00035;sun.shadow.normalBias=.045;sun.shadow.radius=2.5;
 const hemi=new T.HemisphereLight(SKY_COLOR,BOUNCE_COLOR,.62);hemi.name='sky dome + snow bounce';
 group.add(sun,target,hemi);
 return {group,sun,hemi,target};
}
