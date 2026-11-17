// Adaptive render resolution for the level page (r25b).
//
// The level is GPU bound at large canvases: the 4x MSAA HDR target, the
// alpha-cut spruce cards and the bloom chain all scale with pixels. Shipped
// shooters hold the frame rate by moving the internal resolution instead of
// dropping frames, and this governor does the same with the canvas pixel
// ratio: when too many frames miss a 50 fps deadline it steps the ratio down,
// and after a long clean stretch it tries one step up again. A step up that
// brings the misses back is undone and the next attempt waits twice as long,
// so the governor settles instead of oscillating. Only rAF intervals are
// used (no GPU timers), so it works on any browser; frames right after a
// change, a resize or a stall are not counted.

export const RESOLUTION_STEPS=Object.freeze([1,.9,.8,.7]);

export class ResolutionGovernor{
 constructor({steps=RESOLUTION_STEPS,slowMs=20,window=120,downShare=.22,upShare=.02,upAfter=8,trial=3,settle=30,maxGap=250}={}){
  Object.assign(this,{steps,slowMs,window,downShare,upShare,upAfter,trial,settle,maxGap});
  this.reset();
 }
 reset(){this.level=0;this.frames=[];this.skip=this.settle;this.clean=0;this.probe=null;this.backoff=this.upAfter;this.changes=0;}
 get scale(){return this.steps[this.level];}
 // call once per presented frame with the rAF interval in ms; returns the new
 // scale when the governor changes level, otherwise null
 frame(dtMs){
  if(!(dtMs>0)||dtMs>this.maxGap){this.skip=Math.max(this.skip,this.settle>>1);return null;}
  if(this.skip>0){this.skip--;return null;}
  const f=this.frames;f.push(dtMs);if(f.length>this.window)f.shift();
  if(f.length<this.window)return null;
  let slow=0;for(const d of f)if(d>this.slowMs)slow++;const share=slow/f.length;
  const seconds=dtMs/1000;
  // a trial step up that brought misses back: undo it and wait longer next time
  if(this.probe!==null){
   this.probe-=seconds;
   if(share>this.downShare*.5){this.backoff=Math.min(this.backoff*2,120);this.probe=null;this.clean=0;return this.set(this.level+1);}
   if(this.probe<=0){this.probe=null;this.backoff=this.upAfter;}
  }
  if(share>this.downShare&&this.level<this.steps.length-1){this.clean=0;return this.set(this.level+1);}
  this.clean=share<=this.upShare?this.clean+seconds:0;
  if(this.level>0&&this.probe===null&&this.clean>=this.backoff){this.clean=0;this.probe=this.trial;return this.set(this.level-1);}
  return null;
 }
 // a resize or a scene change: keep the level, restart the measurement
 hold(frames=this.settle){this.frames.length=0;this.skip=Math.max(this.skip,frames);}
 set(level){level=Math.max(0,Math.min(this.steps.length-1,level));if(level===this.level)return null;this.level=level;this.changes++;this.hold();return this.scale;}
 inspection(){return {scale:this.scale,level:this.level,changes:this.changes,backoff:this.backoff,trial:this.probe!==null};}
}
