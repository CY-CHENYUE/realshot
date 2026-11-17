import {ENCLOSURE} from './enclosure-profile.mjs';

export const OUTPUT_ASPECT=ENCLOSURE.aperture.width/ENCLOSURE.aperture.height;

// All drawing and interaction use one 4:3-like logical aperture. For the
// physical panel, stretch the *whole* output to its raster, without cropping.
// A regular monitor can instead preview the same aperture at its true ratio.
export function outputLayout(width,height,mode='box'){
 const h=mode==='preview'?Math.min(height,width/OUTPUT_ASPECT):height,w=h*OUTPUT_ASPECT;
 return {mode:mode==='preview'?'preview':'box',width,height,logicalWidth:w,logicalHeight:h,scaleX:mode==='preview'?1:width/w,left:mode==='preview'?(width-w)/2:0,top:mode==='preview'?(height-h)/2:0,aspect:OUTPUT_ASPECT};
}
