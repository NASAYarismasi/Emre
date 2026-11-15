import { Vector3 } from 'three';
/** Habitat airlock: both doors require distinct E commands, with a closed pressure cycle. */
export function createOvaNavigation(world) {
 let inside=false,cycle=null;
 const setDoors=(lock,inner,outer)=>{lock.inner.position.x=inner?-1.8:0;lock.outer.position.x=outer?1.8:0;};
 const closeAll=()=>world.locks.forEach(l=>setDoors(l,false,false));
 function nearest(x,z){return world.locks.find(l=>Math.abs(x-l.x)<1.05&&Math.abs(z-(inside?2.45:world.entryZ))<2);}
 function aimed(camera,x,z,doorX,doorZ){
  if(!camera)return true;const d=camera.getWorldDirection(new Vector3());if(Math.abs(d.z)<.001)return false;const t=(doorZ-z)/d.z;if(t<=0||t>3.5)return false;const hitX=x+d.x*t,hitY=camera.position.y+d.y*t-world.floorY;return Math.abs(hitX-doorX)<.80&&hitY>.02&&hitY<2.12;
 }
 function transition(lock,z,yaw,message){return{x:lock.x,z,y:inside||cycle?world.floorY:world.ground.userData.heightAt(lock.x,z),yaw,message};}
 return {
  get inside(){return inside||Boolean(cycle);},
  reset(){inside=false;cycle=null;closeAll();},
  nearAirlock(x,z){return Boolean(cycle||nearest(x,z));},
  prompt(x,z,camera){if(inside&&world.labPrompt?.(x,z,camera))return world.labPrompt(x,z,camera);if(inside&&world.privacyPrompt?.(x,z))return world.privacyPrompt(x,z);if(cycle)return cycle.awaiting?(aimed(camera,x,z,cycle.lock.x,cycle.exiting?5.12:2.92)?'E · Basınç hazır, ikinci kapıyı aç':'İkinci kapıya bak'):'Hava kilidi · Basınç eşitleniyor…';const lock=nearest(x,z);return lock&&aimed(camera,x,z,lock.x,inside?2.92:5.12)?'E · Hava kilidi':'';},
  interact(x,z,camera){
   if(inside&&world.startLab?.(x,z,camera))return null;
   if(inside&&world.togglePrivacy?.(x,z))return null;
   
   if(cycle){if(cycle.awaiting&&aimed(camera,x,z,cycle.lock.x,cycle.exiting?5.12:2.92)){cycle.released=true;cycle.awaiting=false;cycle.elapsed=4.2;}return null;}
   const lock=nearest(x,z);if(!lock)return null;
   if(!aimed(camera,x,z,lock.x,inside?2.92:5.12))return null;
   cycle={lock,exiting:inside,elapsed:0,released:false,awaiting:false};inside=false;
   setDoors(lock,cycle.exiting,!cycle.exiting);
   return transition(lock,4.01,cycle.exiting?Math.PI:0,'Hava kilidi · Basınç eşitleniyor');
  },
  update(dt){if(!cycle)return null;cycle.elapsed+=dt;const c=cycle;
   if(c.elapsed>=1.2)setDoors(c.lock,false,false);
   if(c.elapsed>=4.2){if(!c.released){c.awaiting=true;return null;}setDoors(c.lock,!c.exiting,c.exiting);
    if(c.elapsed>=5.5){inside=!c.exiting;cycle=null;closeAll();return transition(c.lock,inside?2.35:world.entryZ+.7,inside?0:Math.PI,'Geçiş tamamlandı');}}
   return null;
  },
  collides(x,z){
   if(cycle)return Math.abs(x-cycle.lock.x)>.62||z<3.28||z>4.75;
   if(inside)return Boolean(world.privacyBlocked?.(x,z))||!world.isInsideFloor(x,z)||world.indoorObstacles.some(b=>x>b.min.x-.2&&x<b.max.x+.2&&z>b.min.z-.2&&z<b.max.z+.2);
   return Math.abs(x)>170||Math.abs(z)>170||world.isHabitatBlocked(x,z)||world.obstacles.some(b=>x>b.min.x&&x<b.max.x&&z>b.min.z&&z<b.max.z);
  }
 };
}
