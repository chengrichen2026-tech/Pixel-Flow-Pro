export type UpscaleScale = 2 | 4 | 8;
export type UpscaleTile = { id: string; x: number; y: number; side: number; taskId?: string; resultAssetId?: string };
export type UpscalePlan = { width: number; height: number; scale: UpscaleScale; side: number; overlap: number; tiles: UpscaleTile[] };
export type UpscaleState = { scale: UpscaleScale; plan?: UpscalePlan; sourceAssetId?: string; token?: string };

export function planUpscale(width: number, height: number, scale: number): UpscalePlan {
  if (![2,4,8].includes(scale)) throw new Error('放大倍数只支持 2、4、8');
  if (![width,height].every(n=>Number.isSafeInteger(n)&&n>0)) throw new Error('无法读取原图尺寸');
  if (width*height*scale*scale>64_000_000 || Math.max(width,height)*scale>16384) throw new Error('目标图片过大，请降低放大倍数（最大6400万像素）');
  const side=Math.floor(1024/scale), overlap=Math.max(8,Math.floor(side*0.08)), core=side-overlap*2;
  const tiles:UpscaleTile[]=[];
  for(let y=0,row=0;y<height;y+=core,row++)for(let x=0,col=0;x<width;x+=core,col++)tiles.push({id:`r${row+1}_c${col+1}`,x:x-overlap,y:y-overlap,side});
  if(tiles.length>256)throw new Error('分块数量超过256，请降低倍数');
  return {width,height,scale:scale as UpscaleScale,side,overlap,tiles};
}

export function upscalePrompt(tile:UpscaleTile, scale:number):string {
  const size=tile.side*scale;
  return `本次是整图放大中的一个独立正方形分块，编号 ${tile.id}。只处理第一张分块图，保持1:1。期望像素尺寸 ${size}×${size}；实际尺寸由程序读取图片确认，不以文字或文件名为准。单次输出边长不超过2048像素，禁止输出横向4K或完整大图。不要补大后裁剪来冒充放大。\n若提供第二张整图，第二张仅作内容与色调参考，不得把整图重新画进分块。\n保留分块四周全部内容，不裁切、不扩图、不缩放主体、不移动物体，尤其不要改变边缘处跨块的线条与轮廓。保持产品形状、数量、角度、遮挡关系、文字和Logo的字形、位置及内容。不得增删文字或猜测小字。\n优先保持原图整体颜色与影调，只修复局部噪点和压缩污染，禁止对分块单独重新调色。进行高保真超分增强，让已有细节更清晰、干净，不能重新生成、重绘、风格化或创造不存在的结构。只返回一张处理后的分块图片。`;
}

export function validateUpscaleTile(width:number,height:number,expected:number):void {
  if(width!==height)throw new Error(`分块必须为正方形，实际${width}×${height}`);
  if(width<expected)throw new Error(`分块尺寸不足：实际${width}×${height}，至少需要${expected}×${expected}`);
  if(width>2048)throw new Error('分块超过2048像素，请返回2K以内的正方形图片');
}
