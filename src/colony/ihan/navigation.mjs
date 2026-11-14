/** Original source: ?han, NASAYarismasi/-lhan a7d5ce6. Host integration: IHAN-SRC. */
export function createOvaNavigation(world) {
  let inside = false;
  return {
    get inside() { return inside; },
    reset() { inside = false; for (const lock of world.locks) lock.setDoors(false, false); },
    nearAirlock(x,z) { return Math.hypot(x,z-(inside ? 2.45 : world.entryZ)) <= (inside ? 2 : 3); },
    interact(x,z) {
      if (!this.nearAirlock(x,z)) return null;
      inside = !inside;
      world.locks.find(lock => lock.x === 0)?.setDoors(inside, !inside);
      return {x:0, y:inside ? world.floorY : world.ground.userData.heightAt(0,world.entryZ+.7),
        z:inside ? 2.45 : world.entryZ+.7, yaw:inside ? 0 : Math.PI,
        message:inside ? 'İç mekân · Diğer kubbelere yan tünellerden geç. E: hava kilidinden çık.' : 'Dış ortam · E ile hava kilidinden gir.'};
    },
    collides(x,z) {
      if (inside) return !world.isInsideFloor(x,z);
      return Math.abs(x)>170 || Math.abs(z)>170 || world.isHabitatBlocked(x,z) || world.obstacles.some(box =>
        x>box.min.x && x<box.max.x && z>box.min.z && z<box.max.z);
    },
  };
}
