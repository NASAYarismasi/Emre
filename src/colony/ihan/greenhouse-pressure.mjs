// GAME ASSUMPTION: procedural pressure-hiss duration, filter and volume; no external audio asset.
let airAudio;
export function disposePressureAudio(){airAudio?.close().catch(()=>{});airAudio=undefined;}
export function playPressureHiss(){
 try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;airAudio??=new AC();airAudio.resume().catch(()=>{});const rate=airAudio.sampleRate,buffer=airAudio.createBuffer(1,rate*5,rate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;const source=airAudio.createBufferSource(),filter=airAudio.createBiquadFilter(),gain=airAudio.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1900;filter.Q.value=.65;source.connect(filter);filter.connect(gain);gain.connect(airAudio.destination);const t=airAudio.currentTime;gain.gain.setValueAtTime(0,t);gain.gain.setValueAtTime(0,t+1.2);gain.gain.linearRampToValueAtTime(.12,t+1.5);gain.gain.setValueAtTime(.12,t+3.65);gain.gain.linearRampToValueAtTime(0,t+4.2);source.start(t);source.stop(t+4.25);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};}catch{}
}
