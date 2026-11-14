import * as T from 'three'
import { LANDER_PAD, ARRIVAL_ROUTE } from '../../data/colonyLayout.js'
import { batchStaticLeaves } from './static-model.mjs'

/** GAME ASSUMPTION: shallow blast-swept regolith, compressed footpad prints and EVA waymarkers.
 * Procedural original artwork. All decal vertices follow the rendered ground sampler.
 */
export function createLandingZone(scene, heightAt) {
  const root = new T.Group(); root.name = 'Prepared_landing_zone'; scene.add(root)
  const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true,
    opacity: .46, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
  const disk = new T.RingGeometry(.1, LANDER_PAD.radius, 80, 8).rotateX(-Math.PI / 2)
  const positions = disk.attributes.position, colors = [], inner = new T.Color(0x493c31), outer = new T.Color(0x9b7756)
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + LANDER_PAD.x, z = positions.getZ(i) + LANDER_PAD.z
    const radius = Math.hypot(x - LANDER_PAD.x, z - LANDER_PAD.z)
    positions.setXYZ(i, x, heightAt(x, z) + .015, z)
    const c = inner.clone().lerp(outer, radius / LANDER_PAD.radius)
    colors.push(c.r, c.g, c.b, 1-T.MathUtils.smoothstep(radius,10,LANDER_PAD.radius))
  }
  disk.setAttribute('color', new T.Float32BufferAttribute(colors, 4)); disk.computeVertexNormals()
  const swept = new T.Mesh(disk, material); swept.receiveShadow = true; root.add(swept)
  const print = new T.MeshStandardMaterial({ color: 0x4b382c, roughness: 1, transparent: true, opacity: .44,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = LANDER_PAD.x + sx * 8.5 / Math.sqrt(2), z = LANDER_PAD.z + sz * 8.5 / Math.sqrt(2)
    const mesh = new T.Mesh(new T.CircleGeometry(1.1, 20).rotateX(-Math.PI / 2), print)
    mesh.position.set(x, heightAt(x, z) + .025, z); root.add(mesh)
  }
  const steel = new T.MeshStandardMaterial({ color: 0x686056, metalness: .45, roughness: .58 })
  const amber = new T.MeshStandardMaterial({ color: 0xd6a639, emissive: 0x6c3810, emissiveIntensity: .3, roughness: .8 })
  for (let i = 1; i < ARRIVAL_ROUTE.length; i++) {
    const a = ARRIVAL_ROUTE[i - 1], b = ARRIVAL_ROUTE[i], count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10)
    for (let j = 0; j < count; j++) {
      const x = T.MathUtils.lerp(a.x, b.x, j / count) - 1.5, z = T.MathUtils.lerp(a.z, b.z, j / count), y = heightAt(x, z)
      const pole = new T.Mesh(new T.CylinderGeometry(.025, .025, 1.05, 6), steel)
      pole.position.set(x, y + .5, z)
      const flag = new T.Mesh(new T.BoxGeometry(.35, .22, .025), amber); flag.position.set(x + .16, y + .9, z)
      root.add(pole, flag)
    }
  }
  const retired = new Set(); root.traverse(o => { if (o.geometry) retired.add(o.geometry) })
  batchStaticLeaves(root)
  root.traverse(o => retired.delete(o.geometry)); retired.forEach(g => g.dispose())
  return root // The scene lifecycle owns all resources.
}
