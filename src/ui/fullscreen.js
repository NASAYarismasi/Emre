function onFullscreenKey(event) {
  if(event.code!=='F11'||event.ctrlKey||event.altKey||event.metaKey)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(event.repeat)return;
  const change=document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  change?.catch(()=>{});
}
window.addEventListener('keydown',onFullscreenKey,true);
if(import.meta.hot)import.meta.hot.dispose(()=>{
  window.removeEventListener('keydown',onFullscreenKey,true);
});
