import { validateUpscaleTile, type UpscalePlan, type UpscaleTile } from '../domain/image-upscale';

export async function cropUpscaleTile(source:ImageBitmap,tile:UpscaleTile):Promise<Blob>{
  const canvas=new OffscreenCanvas(tile.side,tile.side),ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,tile.side,tile.side);
  // Extend border pixels into padding; retain square coordinates even for narrow or transparent inputs.
  const sx=Math.max(0,tile.x),sy=Math.max(0,tile.y),sw=Math.min(source.width,tile.x+tile.side)-sx,sh=Math.min(source.height,tile.y+tile.side)-sy;
  if(sw>0&&sh>0){const dx=sx-tile.x,dy=sy-tile.y;ctx.drawImage(source,sx,sy,sw,sh,dx,dy,sw,sh);
    if(dx>0)ctx.drawImage(source,sx,sy,1,sh,0,dy,dx,sh);
    if(dy>0)ctx.drawImage(canvas,0,dy,tile.side,1,0,0,tile.side,dy);
    const right=dx+sw,bottom=dy+sh;
    if(right<tile.side)ctx.drawImage(canvas,right-1,0,1,tile.side,right,0,tile.side-right,tile.side);
    if(bottom<tile.side)ctx.drawImage(canvas,0,bottom-1,tile.side,1,0,bottom,tile.side,tile.side-bottom);
  }
  return canvas.convertToBlob({type:'image/png'});
}

export async function mergeUpscaleTiles(plan:UpscalePlan, source:Blob, load:(tile:UpscaleTile)=>Promise<Blob>):Promise<Blob>{
  const width=plan.width*plan.scale,height=plan.height*plan.scale;
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d')!;
  const size=plan.side*plan.scale,fade=2*plan.overlap*plan.scale;
  for(const tile of plan.tiles){
    const bitmap=await createImageBitmap(await load(tile));
    try{validateUpscaleTile(bitmap.width,bitmap.height,size);
      const scratch=new OffscreenCanvas(size,size),s=scratch.getContext('2d')!;
      s.drawImage(bitmap,0,0,size,size);
      s.globalCompositeOperation='destination-in';
      if(tile.x+plan.overlap>0){const gradient=s.createLinearGradient(0,0,fade,0);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,'rgba(0,0,0,1)');s.fillStyle=gradient;s.fillRect(0,0,size,size);}
      if(tile.y+plan.overlap>0){const gradient=s.createLinearGradient(0,0,0,fade);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,'rgba(0,0,0,1)');s.fillStyle=gradient;s.fillRect(0,0,size,size);}
      ctx.drawImage(scratch,tile.x*plan.scale,tile.y*plan.scale);
    }finally{bitmap.close();}
  }
  // Preserve source transparency deterministically, regardless of generated tile backgrounds.
  const original=await createImageBitmap(source);
  try{ctx.globalCompositeOperation='destination-in';ctx.drawImage(original,0,0,width,height);}finally{original.close();}
  return canvas.convertToBlob({type:'image/png'});
}
