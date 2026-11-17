// Weapon-only spring response. The world camera and calibrated target stay fixed.
export class WeaponFeedback{
 constructor(){this.reset();}
 reset(){this.z=0;this.pitch=0;this.roll=0;this.vz=0;this.vp=0;this.vr=0;this.energy=0;this.hit=0;this.count=0;}
 shoot(aiming=false){const gain=aiming?.48:1;this.count++;this.z=Math.min(.055,this.z+.012*gain);this.vz=Math.min(1.25,this.vz+.9*gain);this.pitch=Math.min(.07,this.pitch+.014*gain);this.vp+=.65*gain;this.vr+=(this.count%2?1:-1)*.22*gain;this.energy=1;}
 impact(kind){this.hit=['clear','shieldBreak'].includes(kind)?1:kind==='critical'?.7:.35;}
 update(dt){
  const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps;
  for(let i=0;i<steps;i++)for(const[p,v,k,c]of[['z','vz',380,32],['pitch','vp',420,34],['roll','vr',270,27]]){this[v]+=(-k*this[p]-c*this[v])*h;this[p]+=this[v]*h;}
  this.energy=Math.max(0,this.energy-dt*13);this.hit=Math.max(0,this.hit-dt*5);
 }
 snapshot(){return {z:this.z,pitch:this.pitch,roll:this.roll,energy:this.energy,hit:this.hit,count:this.count};}
}
