import {outputLayout} from './output-space.mjs';

// The window raster and the CAD aperture are different coordinate systems.
// Map the complete logical picture once; canvas, weapon, HUD and pointer UV
// all share it. The preview keeps the same CAD aspect on an ordinary monitor.
export function defenseOutput(width,height,surface='window'){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new RangeError('Output dimensions must be positive');
 if(surface==='window')return {surface,width,height,logicalWidth:width,logicalHeight:height,scaleX:1,left:0,top:0,aspect:width/height};
 if(!['box','box-preview'].includes(surface))throw new RangeError('Unknown defense surface '+surface);
 return {...outputLayout(width,height,surface==='box-preview'?'preview':'box'),surface};
}
