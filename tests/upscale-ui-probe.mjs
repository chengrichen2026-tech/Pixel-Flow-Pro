// Run in the real extension page through page.evaluate; verifies rendered UI, not CSS source text.
export function assertUpscaleTileBorders({width=1}={}) {
  const grid=document.querySelector('.upscale-tiles');
  if(!grid?.children.length)throw new Error('No upscale thumbnails to inspect');
  const colors={generating:'rgb(155, 123, 236)',completed:'rgb(221, 225, 232)',failed:'rgb(220, 81, 75)'};
  for(const tile of grid.children){
    const css=getComputedStyle(tile);
    if(parseFloat(css.borderTopWidth)!==width||parseFloat(css.borderLeftWidth)!==width)throw new Error(`Unexpected border width on ${tile.dataset.upscaleTile}`);
    if(css.borderTopColor!==colors[tile.dataset.tileState])throw new Error(`Wrong state color on ${tile.dataset.upscaleTile}`);
  }
  if(grid.querySelector('button,figcaption')||grid.innerText.trim())throw new Error('Visible tile controls or labels returned');
  if(grid.scrollHeight>grid.clientHeight)throw new Error('Thumbnail list is scrolling internally');
  return {count:grid.children.length,borderWidth:width,stateColorsCorrect:true,noVisibleControls:true,noInternalScroll:true};
}
