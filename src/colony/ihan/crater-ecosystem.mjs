/** Original source: İhan, NASAYarismasi/-lhan a7d5ce6 → ed79956. Host integration: IHAN-SRC. */
// Source visual dimensions are GAME ASSUMPTIONS, not surveyed Mars terrain.
import * as T from "three";
import { makeKit } from "./equipment-kit.mjs";
import {addSolarFarm} from "./solar-farm.mjs";
import { createCommsStation } from './comms-station.mjs';
import { COMMS_PAD, PAD_KEEPOUTS, ARRIVAL_ROUTE } from '../../data/colonyLayout.js';
export function getTerrainHeight(x, z) {
  return .09 * Math.sin(x * .054 + z * .025)
       + .07 * Math.sin(z * .067 - x * .034)
}

// ============================================================================
// DYNAMIC PROCEDURAL TEXTURE GENERATION (HIGH-RESOLUTION REGOLITH)
// ============================================================================
// Kusursuz (seamless) tiling yüzey detayı: kum tanesi, çakıl ve mikro çukur.
// 2048px genel albedo 620m'yi kapladığı için yakın planda bulanık kalıyor;
// bu doku shader içinde çarpılarak gerçek regolit tanesini geri getirir.
function generateSurfaceDetailTexture() {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const ctx = canvas.getContext("2d")

  let seed = 13177
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }

  // Temel kum gürültüsü (ortalama 0.5)
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + (rnd() - 0.5) * 120
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v))
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)

  const wrapped = (draw) => {
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) draw(ox, oy)
    }
  }

  // Yumuşak toz lekeleri
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 18 + rnd() * 70
    wrapped((ox, oy) => {
      const grad = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
      const tone = rnd() < 0.5 ? 255 : 0
      grad.addColorStop(0, "rgba(" + tone + "," + tone + "," + tone + ",0.10)")
      grad.addColorStop(1, "rgba(" + tone + "," + tone + "," + tone + ",0)")
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // Çakıl taneleri: açık ve koyu, hafif gölgeli
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 0.7 + Math.pow(rnd(), 2.4) * 5.2
    const rot = rnd() * Math.PI
    const light = rnd() < 0.55
    const value = light ? 175 + rnd() * 70 : 45 + rnd() * 55
    wrapped((ox, oy) => {
      ctx.fillStyle = "rgba(" + Math.round(value) + "," + Math.round(value) + "," + Math.round(value) + "," + (0.28 + rnd() * 0.35) + ")"
      ctx.beginPath()
      ctx.ellipse(x + ox, y + oy, r, r * (0.55 + rnd() * 0.5), rot, 0, Math.PI * 2)
      ctx.fill()

      // ışık yönü hissi: üst kenarı aydınlat
      ctx.strokeStyle = "rgba(255,255,255,0.16)"
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(x + ox, y + oy, r * 1.02, Math.PI * 1.05, Math.PI * 1.85)
      ctx.stroke()
    })
  }

  // İnce kum sırtları
  ctx.lineWidth = 1
  for (let i = 0; i < 40; i++) {
    const y0 = rnd() * size
    const amp = 2 + rnd() * 6
    const freq = 0.02 + rnd() * 0.05
    ctx.strokeStyle = rnd() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"
    ctx.beginPath()
    for (let x = 0; x <= size; x += 4) {
      const y = y0 + Math.sin(x * freq + i) * amp
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const texture = new T.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = T.RepeatWrapping
  texture.colorSpace = T.NoColorSpace
  texture.anisotropy = 16
  return texture
}

function generateRegolithTextures(isMoonMode = false, extent = 450) {
  const size = 2048
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const ctx = canvas.getContext("2d")

  // Tozlu Mars regoliti: kızıl toprak, açık toz lekeleri, bazalt çakıl.
  // Ay modu aynı üreticiyi monokrom paletle kullanır (karşılaştırma görünümü).
  const pal = isMoonMode
    ? { base: [146, 147, 152], light: [216, 217, 221], dark: [76, 77, 82], rock: [118, 119, 125], ray: [238, 240, 244] }
    : { base: [148, 95, 72], light: [203, 158, 126], dark: [88, 54, 43], rock: [121, 82, 64], ray: [212, 160, 122] }

  const css = (tone, alpha) => "rgba(" + tone[0] + ", " + tone[1] + ", " + tone[2] + ", " + alpha + ")"

  ctx.fillStyle = css(pal.base, 1)
  ctx.fillRect(0, 0, size, size)

  let seed = 4921
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }

  const worldToTex = (wx, wz) => ({
    u: ((wx + extent) / (2 * extent)) * size,
    v: ((wz + extent) / (2 * extent)) * size
  })

  // 1. Büyük toz ve toprak lekeleri: yumuşak, doğal renk geçişleri
  for (let i = 0; i < 360; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 26 + Math.pow(rnd(), 2.1) * 165
    const tone = rnd() < 0.55 ? pal.light : pal.dark
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, css(tone, 0.14 + rnd() * 0.24))
    grad.addColorStop(1, css(tone, 0))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Orta ölçek: toz birikintileri ve çakıl cepleri (yakın planda okunur)
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const r = 2 + Math.pow(rnd(), 1.6) * 15
    const tone = rnd() < 0.5 ? pal.light : pal.dark
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, css(tone, 0.10 + rnd() * 0.18))
    grad.addColorStop(1, css(tone, 0))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 2. Rüzgâr dalgaları: ince kum sırtları
  ctx.lineWidth = 2
  for (let band = 0; band < 90; band++) {
    const y0 = rnd() * size
    const amp = 2 + rnd() * 8
    const freq = 0.004 + rnd() * 0.012
    const tone = rnd() < 0.5 ? pal.light : pal.dark
    ctx.strokeStyle = css(tone, 0.03 + rnd() * 0.05)
    ctx.beginPath()
    for (let x = 0; x <= size; x += 8) {
      const y = y0 + Math.sin(x * freq + band) * amp + Math.sin(x * freq * 2.7) * amp * 0.4
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // 5. Çakıl, taş ve toz taneleri (Mars yüzeyinin karakteristik dokusu)
  for (let i = 0; i < 18000; i++) {
    const mx = rnd() * size
    const my = rnd() * size
    const mr = 0.5 + Math.pow(rnd(), 2) * 3.6
    const pick = rnd()
    const tone = pick < 0.45 ? pal.rock : pick < 0.8 ? pal.dark : pal.light
    ctx.fillStyle = css(tone, 0.16 + rnd() * 0.46)
    ctx.beginPath()
    ctx.ellipse(mx, my, mr, mr * (0.55 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // 6. İnce gren
  const imgData = ctx.getImageData(0, 0, size, size)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const grain = (rnd() - 0.5) * (isMoonMode ? 26 : 18)
    d[i] = Math.min(255, Math.max(0, d[i] + grain))
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + grain))
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + grain))
  }
  ctx.putImageData(imgData, 0, 0)

  const albedoTexture = new T.CanvasTexture(canvas)
  albedoTexture.colorSpace = T.SRGBColorSpace
  albedoTexture.wrapS = albedoTexture.wrapT = T.ClampToEdgeWrapping
  albedoTexture.anisotropy = 16

  // Yakın plan için tekrar eden ince taneli kabartma dokusu
  const detail = document.createElement("canvas")
  detail.width = detail.height = 256
  const dCtx = detail.getContext("2d")
  const dImg = dCtx.createImageData(256, 256)
  for (let i = 0; i < dImg.data.length; i += 4) {
    const v = 96 + rnd() * 96
    dImg.data[i] = dImg.data[i + 1] = dImg.data[i + 2] = v
    dImg.data[i + 3] = 255
  }
  dCtx.putImageData(dImg, 0, 0)
  const bumpTexture = new T.CanvasTexture(detail)
  bumpTexture.wrapS = bumpTexture.wrapT = T.RepeatWrapping
  bumpTexture.repeat.set(extent * 0.85, extent * 0.85)
  bumpTexture.anisotropy = 8

  return { albedoTexture, bumpTexture }
}

export function createOvaWorld(scene){
  const terrainSize = 620 // 620m x 620m: kesintisiz Mars ovası ve uzak sırtlar
  const segments = 96 // IHAN-SRC: retain host terrain budget; original 320    // ~2m çözünürlük
  const terrainGeo = new T.PlaneGeometry(terrainSize, terrainSize, segments, segments)
  terrainGeo.rotateX(-Math.PI / 2) // Orient to X-Z plane

  const posAttr = terrainGeo.attributes.position
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i)
    const z = posAttr.getZ(i)
    const y = getTerrainHeight(x, z)
    posAttr.setY(i, y)
  }
  terrainGeo.computeVertexNormals()

  // Mars regolit dokuları (tema ile Ay referansına çevrilebilir)
  let currentTheme = "mars"
  const terrainExtent = terrainSize / 2
  let { albedoTexture, bumpTexture } = generateRegolithTextures(false, terrainExtent)

  const terrainMat = new T.MeshStandardMaterial({
    map: albedoTexture,
    bumpMap: bumpTexture,
    bumpScale: 0.10,
    roughness: 1.0,
    metalness: 0.02
  })

  // Yakın planda kum/çakıl tanesini geri getiren tiling detay katmanı.
  // İki farklı ölçekte örneklenir; tekrar deseni böylece görünmez olur.
  const surfaceDetail = generateSurfaceDetailTexture()
  const photoSource = true // IHAN-SRC: Vite URL, no embedded base64
  const regolithPhoto = photoSource
    ? new T.TextureLoader().load(import.meta.env.BASE_URL + "models/colony/three-forks-regolith.jpg")
    : surfaceDetail
  if (photoSource) {
    regolithPhoto.colorSpace = T.SRGBColorSpace
    regolithPhoto.wrapS = regolithPhoto.wrapT = T.MirroredRepeatWrapping
    regolithPhoto.anisotropy = 8
  }
  const photoWeight = {value:photoSource ? 1 : 0}
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uRegolith = {value:regolithPhoto}
    shader.uniforms.uPhotoWeight = photoWeight
    shader.uniforms.uDetailMap = { value: surfaceDetail }
    shader.uniforms.uDetailScale = { value: 84 }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D uDetailMap;\nuniform float uDetailScale;\nuniform sampler2D uRegolith;\nuniform float uPhotoWeight;"
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float dA = texture2D(uDetailMap, vMapUv * uDetailScale).r;
        float dB = texture2D(uDetailMap, vMapUv * uDetailScale * 3.17 + vec2(0.37, 0.11)).r;
        float dGrain = dA * 0.66 + dB * 0.34;
        diffuseColor.rgb *= 0.71 + dGrain * 0.60;
        vec2 meters = (vMapUv - .5) * vec2(620.,-620.);
        vec2 photoUv = meters / vec2(2.8,2.5) + .10 * sin(meters.yx * .81);
        vec3 photo = texture2D(uRegolith,photoUv).rgb;
        vec3 photoWide = texture2D(uRegolith,vec2(.6*meters.x+.8*meters.y,-.8*meters.x+.6*meters.y)/6.1).rgb;
        float drift = sin(meters.x*.31+sin(meters.y*.19))*sin(meters.y*.22+meters.x*.07);
        vec3 soil = mix(photo,photoWide,.28)*(1.22 + .16*drift);
        soil *= .90 + .22*dGrain;
        float along = meters.y-14.5;
        float center = 5.75 + along*.20 + .006*along*along;
        float wheels = abs(abs(meters.x-center)-1.03);
        float trace = 1.-smoothstep(.10,.26,wheels);
        float tread = smoothstep(.22,.76,sin(along*48.+meters.x*11.));
        trace *= smoothstep(-1.,.25,along)*(1.-smoothstep(23.,29.,along));
        soil *= 1.-trace*(.095 + tread*.11);
        vec2 drill = meters - vec2(60.7,-26.8);
        float outline = length(drill/vec2(3.8,2.6)) + .10*sin(drill.x*6.+drill.y*4.) + .10*dGrain;
        float icePatch = 1.-smoothstep(.52,1.03,outline);
        float veins = sin(drill.x*8.+sin(drill.y*6.)*1.65+drill.y*3.);
        float frost = smoothstep(.11,.78,veins*.38 + photo.r*.85 + .28);
        vec3 icySoil = mix(soil*.83,vec3(.58,.65,.69),frost*.72);
        soil = mix(soil,icySoil,icePatch);
        diffuseColor.rgb = mix(diffuseColor.rgb,soil,uPhotoWeight);`
      )
  }
  terrainMat.customProgramCacheKey = () => "mars-regolith-detail-v1"

  const terrainMesh = new T.Mesh(terrainGeo, terrainMat)
  terrainMesh.receiveShadow = true
  terrainMesh.castShadow = true
  scene.add(terrainMesh)

  // ==========================================================================
  // UZAK TEPELER (MARS UFUK SIRTLARI)
  // ==========================================================================
  const hills = new T.Group()
  const hillMat = new T.MeshStandardMaterial({ color: 0x9d6b53, roughness: 1, metalness: 0, flatShading: true })
  const hillMatFar = new T.MeshStandardMaterial({ color: 0xb08a6f, roughness: 1, metalness: 0, flatShading: true })
  const moundGeo = new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)

  let hSeed = 4711
  const hRnd = () => {
    hSeed = (Math.imul(hSeed, 1664525) + 1013904223) >>> 0
    return hSeed / 4294967296
  }

  for (let ring = 0; ring < 2; ring++) {
    const baseRadius = ring === 0 ? 250 : 390
    for (let i = 0; i < 54; i++) {
      const angle = (i / 54) * Math.PI * 2 + hRnd() * 0.09
      const radius = baseRadius + hRnd() * (ring === 0 ? 55 : 90)
      const width = (ring === 0 ? 34 : 60) + hRnd() * (ring === 0 ? 45 : 80)
      const height = (ring === 0 ? 3 : 6) + hRnd() * (ring === 0 ? 5 : 11)
      const mound = new T.Mesh(moundGeo, ring === 0 ? hillMat : hillMatFar)
      mound.scale.set(width, height, width * (0.5 + hRnd() * 0.5))
      mound.position.set(Math.cos(angle) * radius, -height * 0.18, Math.sin(angle) * radius)
      mound.rotation.y = hRnd() * Math.PI
      mound.receiveShadow = true
      hills.add(mound)
    }
  }
  scene.add(hills)

  // ==========================================================================
  // INSTANCED BOULDERS & IMPACT BRECCIA FIELDS
  // ==========================================================================
  // Mars taş tarlası: iri kayalar, yassı tabakalar ve çakıl
  const rockMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0.03, flatShading: true })
  function fracturedRock(seed, flat) {
    const geometry = new T.IcosahedronGeometry(1,2)
    const position = geometry.attributes.position
    for (let i=0;i<position.count;i++) {
      const x=position.getX(i), y=position.getY(i), z=position.getZ(i)
      const wear=1+.13*Math.sin(x*5.3+y*3.7+seed)*Math.cos(z*4.7-y*3.1)
      const top=flat ? .56+.19*x-.09*z : .83+.24*x+.15*z
      position.setXYZ(i,x*wear+.16*y,Math.max(-.73,Math.min(y*wear,top)),z*wear)
    }
    geometry.computeVertexNormals()
    return geometry
  }

  rockMat.onBeforeCompile = shader => {
    shader.vertexShader="varying vec3 rockPoint;\n"+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nrockPoint=position;")
    shader.fragmentShader="varying vec3 rockPoint;\n"+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`
      #include <color_fragment>
      vec3 p = rockPoint;
      float erosion=sin(p.y*43.+sin(p.x*8.+p.z*7.)*.62);
      float grains=sin(dot(p,vec3(87.,131.,111.)))*sin(dot(p,vec3(153.,-123.,187.)));
      float bed=smoothstep(.58,.98,erosion);
      diffuseColor.rgb *= .89 + bed*.22 + grains*.13;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.31,1.18,1.03),
        .38*(1.-smoothstep(-.72,.05,p.y)));
    `)
  }
  const pebbleMat = new T.MeshStandardMaterial({color:0xffffff,roughness:.96,flatShading:true})

  const dummy = new T.Object3D()
  const tint = new T.Color()
  const rockLayers = []
  const rockObstacles = []

  let rSeed = 8831
  function rRnd() {
    rSeed = (Math.imul(rSeed, 1664525) + 1013904223) >>> 0
    return rSeed / 4294967296
  }

  function scatterRocks(mesh, count, options) {
    mesh.geometry.computeBoundingBox()
    const geometryBounds=mesh.geometry.boundingBox
    const tints = []
    let placed = 0
    let guard = 0
    while (placed < count && guard < count * 20) {
      guard++
      const angle = rRnd() * Math.PI * 2
      const radius = Math.sqrt(rRnd()) * options.radius
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const patches=.5+.5*Math.sin(x*.17+Math.sin(z*.14)*1.7)*Math.cos(z*.16-x*.11)
      if (rRnd() > .32+.68*patches) continue
      // Üssün oturduğu alanı boş bırak
      if (Math.hypot(x, z) < options.pad) continue
      // Host layout: clear both prepared pads and the marked EVA corridor before scattering rocks.
      if (PAD_KEEPOUTS.some(([px,pz,r])=>Math.hypot(x-px,z-pz)<r+2)) continue
      if (ARRIVAL_ROUTE.some((b,i)=>{
        if (!i) return false
        const a=ARRIVAL_ROUTE[i-1],dx=b.x-a.x,dz=b.z-a.z
        const t=T.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1)
        return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<3.5
      })) continue

      const scale = options.minScale + Math.pow(rRnd(), 2.6) * (options.maxScale - options.minScale)
      dummy.position.set(x, getTerrainHeight(x, z) + scale * (0.51 * options.flat - options.bury), z)
      const tilt = options.tilt === undefined ? Math.PI : options.tilt
      dummy.rotation.set((rRnd() - 0.5) * tilt, rRnd() * Math.PI * 2, (rRnd() - 0.5) * tilt)
      dummy.scale.set(scale, scale * options.flat * (0.5 + rRnd() * 0.6), scale * (0.7 + rRnd() * 0.6))
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
      if (scale>.32 && options.maxScale>.26) {
        const bounds=geometryBounds.clone().applyMatrix4(dummy.matrix)
        if(bounds.max.y-getTerrainHeight(x,z)>.095) rockObstacles.push(bounds)
      }
      tints.push({ pick: Math.floor(rRnd() * options.palette.length), light: (rRnd() - 0.5) * 0.12 })
      placed++
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = options.maxScale > .26
    mesh.receiveShadow = true
    mesh.userData.tints = tints
    mesh.userData.palette = options.palette
    rockLayers.push(mesh)
    scene.add(mesh)
  }

  function paintRocks(isMoonMode) {
    for (const mesh of rockLayers) {
      const palette = isMoonMode
        ? [0x6f7076, 0x83848a, 0x9a9ba1, 0x5c5d63, 0x8a8b91]
        : mesh.userData.palette
      mesh.userData.tints.forEach((entry, index) => {
        tint.setHex(palette[entry.pick % palette.length])
        tint.offsetHSL(0, 0, entry.light)
        mesh.setColorAt(index, tint)
      })
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  const MARS_ROCK_COLORS = [0x8a6350, 0x9c7460, 0xa88268, 0x74503f, 0xb59a83]
  const MARS_SLAB_COLORS = [0x8f6a56, 0xa07c65, 0x7a5746, 0xb19079, 0x6d4d3f]
  const MARS_PEBBLE_COLORS = [0x7d5747, 0x96705a, 0xa9876d, 0x6a4a3c]

  for (const seed of [2,7,12]) {
    const slabs=seed!==7
    const count=slabs?380:680
    scatterRocks(new T.InstancedMesh(fracturedRock(seed,slabs),rockMat,count),count,{
      minScale:slabs?.15:.18, maxScale:slabs?1.75:1.5,
      flat:slabs?.33:.72, radius:seed===12?112:245,
      bury:.25, pad:slabs?15:25,
      palette:slabs?MARS_SLAB_COLORS:MARS_ROCK_COLORS, tilt:slabs?.45:.65
    })
  }
  scatterRocks(new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), pebbleMat, 2200), 2200, {
    minScale: 0.035, maxScale: 0.26, flat: 0.7, radius: 140, bury: 0.42, pad: 12, palette: MARS_PEBBLE_COLORS, tilt: 1.1,
  })
  // Koloni sahasının çevresindeki ince çakıl halısı (yakın plan dokusu)
  scatterRocks(new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), pebbleMat, 3500), 3500, {
    minScale: 0.02, maxScale: 0.11, flat: 0.65, radius: 58, bury: 0.45, pad: 8, palette: MARS_PEBBLE_COLORS, tilt: 1.3,
  })
  paintRocks(false)

  // ==========================================================================
  // RESEARCH BASE MODULES & LIFE SUPPORT COLONY (LOCATED ON TERRACE AT X=0, Z=0)
  // ==========================================================================
  const colonyGroup = new T.Group()
  const baseObstacles = []
  const indoorObstacles = []

  // Panelized weather covers, low service decks and recessed airlocks.
  const sand = new T.MeshStandardMaterial({vertexColors:true, roughness:.82})
  const steel = new T.MeshStandardMaterial({color:0x686056, metalness:.45, roughness:.58})
  const deckMat = new T.MeshStandardMaterial({color:0x76634e, roughness:.94})
  const hatchMat = new T.MeshStandardMaterial({color:0x827465, roughness:.63, metalness:.22})
  const seal = new T.MeshStandardMaterial({color:0xc0a688, roughness:.7})
  function mesh(group, geometry, material, x,y,z){
    const part = new T.Mesh(geometry,material)
    part.position.set(x,y,z)
    group.add(part)
    return part
  }

  const points = []
  const colors = []
  const panelColor = new T.Color()
  const sectors = 28
  const rings = [[3.65,0],[3.65,.50],[3.56,.92],[3.33,1.51],[3.02,2.12],[2.55,2.65],[1.87,3.05],[1.03,3.31]]
  function vertex(row,index){
    const [radius,y] = rings[row]
    const angle = (index + (row%2)*.5)*Math.PI*2/sectors
    return [radius*Math.cos(angle),y,radius*Math.sin(angle)]
  }
  function panel(a,b,c){
    panelColor.setHex(0xbeb2a1).multiplyScalar(.975+.025*(.5+.5*Math.sin(points.length*13.19)))
    points.push(...a,...b,...c)
    for(let i=0;i<3;i++) colors.push(panelColor.r,panelColor.g,panelColor.b)
  }
  for(let row=0;row<rings.length-1;row++){
    for(let col=0;col<sectors;col++){
      const lower=vertex(row,col)
      const next=vertex(row,col+1)
      const upper=vertex(row+1,col)
      const offset=vertex(row+1,col+(row%2?-1:1))
      if(row%2){
        panel(lower,offset,upper)
        panel(lower,upper,next)
      }else{
        panel(lower,upper,next)
        panel(next,upper,offset)
      }
    }
  }
  for(let col=0;col<sectors;col++) panel(vertex(rings.length-1,col),[0,3.49,0],vertex(rings.length-1,col+1))
  const shell = new T.BufferGeometry()
  shell.setAttribute("position",new T.Float32BufferAttribute(points,3))
  shell.setAttribute("color",new T.Float32BufferAttribute(colors,3))
  const normals = []
  for (let i=0;i<points.length;i+=3) {
    const normal = new T.Vector3(points[i],points[i+1]*1.16,points[i+2]).normalize()
    normals.push(normal.x,normal.y,normal.z)
  }
  shell.setAttribute("normal",new T.Float32BufferAttribute(normals,3))

  const leg=new T.BoxGeometry(.25,1,.25)
  const foot=new T.BoxGeometry(.65,.12,.65)
  const collar=new T.CylinderGeometry(3.65,3.66,.24,32)
  const centers = [-9, 0, 9]
  const radius = 3.65
  const locks = []
  const greenhouseSite={x:19,z:25}
  const waterSite = {x:64,z:-26}
  const floorY = Math.max(...centers.flatMap(x => [-3.8,3.8].flatMap(dx =>
    [-3.65,3.65].map(z => getTerrainHeight(x+dx,z))))) + .34
  const interior = new T.MeshStandardMaterial({color:0xcac2b1,roughness:.86})
  const fabric = new T.MeshStandardMaterial({color:0x87948f,roughness:1})
  const rack = new T.MeshStandardMaterial({color:0x666e70,roughness:.49,metalness:.36})
  const glazing = new T.MeshPhysicalMaterial({
    color:0x97bdc4,transparent:true,opacity:.34,roughness:.12,metalness:.15,side:T.DoubleSide,depthWrite:false
  })
  const light = new T.MeshBasicMaterial({color:0xffe9bd})
  function block(group,w,h,d,material,x,y,z){
    return mesh(group,new T.BoxGeometry(w,h,d),material,x,y,z)
  }
  function wallWithPorts(index){
    const material=sand.clone()
    material.side=T.DoubleSide
    material.onBeforeCompile=shader=>{
      shader.vertexShader="varying vec3 habitatPosition;\n"+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nhabitatPosition=position;")
      // Samet (4c88580): one airlock door (centre dome only), round tunnel mouths matching the 1.25 m
      // connector bore (no corner gaps), and a rear opening in the right dome to the hygiene module.
      const n = index===1 ? 1.28 : .94
      const ports = index===1 ? [`(habitatPosition.z > 2.15 && abs(habitatPosition.x) < .79 && habitatPosition.y*${n} < 2.06)`] : []
      if(index===2) ports.push(`(habitatPosition.z < -2.4 && abs(habitatPosition.x)<.72 && habitatPosition.y*${n}<2.2)`)
      if(index>0) ports.push(`(habitatPosition.x < -2.4 && habitatPosition.z*habitatPosition.z + pow(habitatPosition.y*${n}-1.19,2.0) < 1.25*1.25)`)
      if(index<2) ports.push(`(habitatPosition.x > 2.4 && habitatPosition.z*habitatPosition.z + pow(habitatPosition.y*${n}-1.19,2.0) < 1.25*1.25)`)
      ports.push("(habitatPosition.z > 2.3 && length((habitatPosition.xy-vec2(-1.24,1.56))/vec2(.29,.29))<1.0)")
      ports.push("(habitatPosition.z > 2.3 && length((habitatPosition.xy-vec2(1.24,1.56))/vec2(.29,.29))<1.0)")
      shader.fragmentShader="varying vec3 habitatPosition;\n"+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",`
        #include <color_fragment>
        vec3 p=habitatPosition;
        float grit=sin(dot(p,vec3(212.,331.,177.)))*sin(dot(p,vec3(153.,-287.,227.)));
        float runoff=sin(29.*p.x+31.*p.z+sin(7.*p.z))*.5+.5;
        float dust=(1.-smoothstep(.17,1.4,p.y))*(.38+.62*runoff);
        diffuseColor.rgb *= 1. + grit*.047 - dust*.16;
        diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.13,.94,.78),dust*.42);
      `)
      shader.fragmentShader=shader.fragmentShader.replace("#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif("+ports.join(" || ")+")discard;")
    }
    material.customProgramCacheKey=()=> "habitat-"+index
    return material
  }
  for(const [index,x] of centers.entries()){
    const group=new T.Group()
    group.position.set(x,floorY,0)
    block(group,8.2,.18,8.2,deckMat,0,-.11,0)
    mesh(group,collar,seal,0,-.11,0)
    mesh(group,shell,wallWithPorts(index),0,0,0).scale.y = index===1 ? 1.28 : .94
    for(const dx of [-3.75,3.75]) for(const z of [-3.75,3.75]){
      const base=getTerrainHeight(x+dx,z)-floorY
      const height=Math.max(.08,-base-.14)
      mesh(group,leg,steel,dx,base+height/2,z).scale.y=height
      mesh(group,foot,deckMat,dx,base+.035,z)
    }
    const shellHeight = index===1 ? 1.28 : .94
    const seamMat = new T.MeshStandardMaterial({color:0x988779, roughness:.9})
    for (const ringIndex of [2,4,6]) {
      const [r,y]=rings[ringIndex]
      const seam=mesh(group,new T.TorusGeometry(r-.007,.013,5,72),seamMat,0,y*shellHeight,0)
      seam.rotation.x=Math.PI/2
    }
    const stripe=new T.MeshStandardMaterial({color:0x485962,roughness:.79})
    mesh(group,new T.CylinderGeometry(3.659,3.661,.115,48,1,true),stripe,0,.46,0)
    for(let i=0;i<10;i++){
      const angle=i*Math.PI/5
      const brace=block(group,.12,.53,.047,steel,3.58*Math.cos(angle),.54,3.58*Math.sin(angle))
      brace.rotation.y=Math.PI/2-angle
    }
    for (let i=0; i<sectors; i++) {
      const a=i*Math.PI*2/sectors
      const fastener=mesh(group,new T.BoxGeometry(.048,.06,.025),steel,3.64*Math.cos(a),.38,3.64*Math.sin(a))
      fastener.rotation.y=Math.PI/2-a
    }
    for(const side of [-1,1]){
      const y=1.56*shellHeight
      const porthole=new T.Group()
      porthole.position.set(side*1.24,y,2.96)
      porthole.rotation.y=side*.29
      group.add(porthole)
      const bezel=mesh(porthole,new T.CylinderGeometry(.37,.37,.45,48,1,true),steel,0,0,.065)
      bezel.rotation.x=Math.PI/2
      mesh(porthole,new T.TorusGeometry(.325,.048,12,48),steel,0,0,.29)
      mesh(porthole,new T.CircleGeometry(.327,48),glazing,0,0,.284)
    }
    block(group,1.7,.055,.22,light,0,2.83,-.5)
    const lamp=new T.PointLight(0xffe6b8,10,6)
    lamp.position.set(0,2.65,-.35)
    group.add(lamp)
    const furnishingsStart=group.children.length
    if(index===0){
      // Orion-inspired sleeping bags secured against the cabin wall.
      for(const offset of [-1,0,1]){
        block(group,.66,1.75,.21,fabric,offset,1.02,-2.38)
        block(group,.74,.11,.43,rack,offset,.13,-2.38)
      }
    }else if(index===1){
      // Orion-style stowage, food warmer and potable-water dispenser.
      block(group,2.3,1.05,.63,interior,0,.53,-2.45)
      block(group,.55,.29,.39,rack,-.66,1.2,-2.43)
      block(group,.44,.52,.32,rack,.61,1.31,-2.51)
      block(group,.13,.1,.13,steel,.61,1.15,-2.29)
    }else{
      // ISS-style equipment racks for water recovery and cabin air treatment.
      for(const offset of [-.62,.62]){
        block(group,1.1,1.82,.62,interior,offset,.91,-2.25)
        for(const y of [.43,.85,1.27,1.61]) block(group,.83,.22,.045,rack,offset,y,-1.93)
      }
    }
    group.updateMatrixWorld(true)
    for(const furniture of group.children.slice(furnishingsStart)) {
      indoorObstacles.push(new T.Box3().setFromObject(furniture))
    }
    if(index===1){
      mesh(group,new T.CylinderGeometry(.025,.038,1.58,12),steel,-.5,5.08,-.18)
      mesh(group,new T.CylinderGeometry(.05,.064,.81,12),steel,.42,4.7,-.35)
    }
    // Samet: only the centre dome has the airlock chamber, hatches and ramp (single entrance).
    if(index!==1){
      group.traverse(part=>{if(part.isMesh && part.material!==glazing){part.castShadow=true;part.receiveShadow=true}})
      colonyGroup.add(group)
      continue
    }
    const chamber = new T.Group()
    group.add(chamber)
    block(chamber,1.94,.16,2.28,deckMat,0,-.08,4.01)
    block(chamber,1.94,.16,2.28,seal,0,2.13,4.01)
    for (const side of [-1,1]) {
      block(chamber,.14,2.12,2.28,seal,side*.91,1.06,4.01)
    }
    const kit=makeKit(chamber)
    const brushed=document.createElement("canvas")
    brushed.width=brushed.height=128
    const ctx=brushed.getContext("2d")
    ctx.fillStyle="#89959b"
    ctx.fillRect(0,0,128,128)
    for(let i=0;i<128;i++){
      ctx.fillStyle=i%3?"rgba(225,235,240,.09)":"rgba(25,35,45,.12)"
      ctx.fillRect(0,i,128,1)
    }
    const metalTexture=new T.CanvasTexture(brushed)
    metalTexture.colorSpace=T.SRGBColorSpace
    const hatchMaterial=new T.MeshStandardMaterial({color:0xa9b7bf,map:metalTexture,metalness:.72,roughness:.42})
    const makeHatch = z => {
      const hatch=new T.Group()
      chamber.add(hatch)
      hatch.position.z=z
      const w=1.59,h=2,wY=1.53,r=.23
      const outline=new T.Shape().moveTo(-w/2,.035).lineTo(w/2,.035).lineTo(w/2,h).lineTo(-w/2,h).closePath()
      const hole=new T.Path()
      hole.absarc(0,wY,r,0,Math.PI*2,true)
      outline.holes.push(hole)
      const plate=new T.ExtrudeGeometry(outline,{depth:.16,bevelEnabled:false,curveSegments:32})
      mesh(hatch,plate,hatchMaterial,0,0,-.08)
      mesh(hatch,new T.CircleGeometry(r+.012,48),glazing,0,wY,0)
      const warning=new T.MeshStandardMaterial({color:0xd6a639,roughness:.7})
      for(const face of [-1,1]){
        const zz=face*.105
        mesh(hatch,new T.TorusGeometry(r+.014,.026,10,48),steel,0,wY,zz)
        for(const x of [-w/2+.045,w/2-.045]) kit.box(.065,h-.035,.045,x,1.02,zz,"steel",hatch)
        for(const y of [.065,h-.04]) kit.box(w,.065,.045,0,y,zz,"steel",hatch)
        kit.box(.065,.42,.10,w*.34,1.05,zz+face*.07,"steel",hatch)
        for(const y of [.84,1.26]) kit.box(.10,.065,.13,w*.34,y,zz+face*.025,"dark",hatch)
        kit.box(w*.68,.20,.025,0,.38,zz,"dark",hatch)
        for(let i=0;i<8;i++){
          const stripe=kit.box(.09,.16,.012,-w*.28+i*w*.08,.38,zz+face*.02,warning,hatch)
          stripe.rotation.z=-.35
        }
      }
      return hatch
    }
    const inner=makeHatch(2.92),outer=makeHatch(5.12)
    const lock={x,inner,outer,innerZ:2.35,outerZ:6.05,chamberZ:4.02,floor:floorY,
      setDoors(innerOpen,outerOpen){inner.position.x=innerOpen?-1.65:0;outer.position.x=outerOpen?1.65:0}}
    locks.push(lock)
    for(const z of [3.24,4.86]) block(chamber,.45,.05,.14,light,0,2.03,z)
    const chamberLight = new T.PointLight(0xffdeb0,3,3.6)
    chamberLight.position.set(0,1.95,4)
    chamber.add(chamberLight)
    const footY=getTerrainHeight(x,6.65)+.02
    lock.rampFootY=footY
    const ramp=block(colonyGroup,1.55,.12,Math.hypot(1.53,floorY-footY),deckMat,x,(floorY+footY)/2,5.885)
    ramp.rotation.x=Math.atan2(floorY-footY,1.53)
    ramp.castShadow=ramp.receiveShadow=true
    group.traverse(part=>{if(part.isMesh && part.material!==glazing){part.castShadow=true;part.receiveShadow=true}})
    colonyGroup.add(group)
  }
  const tunnelMaterial=new T.MeshStandardMaterial({color:0xa5a59c,roughness:.66,metalness:.26,side:T.DoubleSide})
  // Samet: trim the connector tube where it pokes inside a dome shell, so no tube walls show indoors.
  tunnelMaterial.onBeforeCompile=shader=>{
    shader.vertexShader="varying vec3 connectorWorld;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nconnectorWorld=(modelMatrix*vec4(position,1.0)).xyz;")
    const trims=centers.map((cx,index)=>{
      const sh=index===1?1.28:.94
      let code=`{float h=(connectorWorld.y-${floorY.toFixed(8)})/${sh};float r=0.0;`
      for(let i=0;i<rings.length-1;i++){
        const [r0,y0]=rings[i],[r1,y1]=rings[i+1]
        code+=`if(h>=${y0.toFixed(6)}&&h<${y1.toFixed(6)})r=mix(${r0.toFixed(6)},${r1.toFixed(6)},(h-${y0.toFixed(6)})/${(y1-y0).toFixed(6)});`
      }
      return code+`if(length(connectorWorld.xz-vec2(${cx.toFixed(1)},0.0))<r-0.025)discard;}`
    }).join("\n")
    shader.fragmentShader="varying vec3 connectorWorld;\n"+shader.fragmentShader.replace("#include <clipping_planes_fragment>","#include <clipping_planes_fragment>\n"+trims)
  }
  tunnelMaterial.customProgramCacheKey=()=>"connector-boundary-trim-v1"
  for(const x of [-4.5,4.5]){
    const tube=mesh(colonyGroup,new T.CylinderGeometry(1.27,1.27,4.05,32,1,true),tunnelMaterial,x,floorY+1.19,0)
    tube.rotation.z=Math.PI/2
    tube.castShadow=tube.receiveShadow=true
    block(colonyGroup,4.1,.14,1.57,deckMat,x,floorY-.025,0)
    for(const dx of [-1.65,-1.1,-.55,0,.55,1.1,1.65]){
      mesh(colonyGroup,new T.TorusGeometry(1.275,.044,8,32),steel,x+dx,floorY+1.19,0).rotation.y=Math.PI/2
    }
  }
  // Samet: strip curtain at the left connector mouth (laboratory side).
  const stripMat=new T.MeshPhysicalMaterial({color:0x9bbcc0,transparent:true,opacity:.27,roughness:.32,side:T.DoubleSide,depthWrite:false})
  block(colonyGroup,.09,.08,1.45,steel,-5.9,floorY+2.22,0)
  for(let i=0;i<9;i++){
    const strip=mesh(colonyGroup,new T.PlaneGeometry(.16,2.03),stripMat,-5.9,floorY+1.17,-.64+i*.16)
    strip.rotation.y=Math.PI/2; strip.rotation.x=(i%2?1:-1)*.025
  }
  const insideZone=(x,z)=>(Math.abs(x-9)<1.12 && z<-2.45 && z>-6.7) // Samet hygiene module
    || centers.some(cx=>Math.hypot(x-cx,z)<radius-.33)
    || (Math.abs(z)<.73 && Math.abs(x)<9)
  const outsideObstacle=(x,z)=> (Math.abs(x-greenhouseSite.x)<5.55 && z>greenhouseSite.z-6.6 && z<greenhouseSite.z+6.6)
    || (Math.abs(x-greenhouseSite.x)<1.55 && z>=greenhouseSite.z+6.6 && z<greenhouseSite.z+9.05)
    || (Math.abs(x-9)<1.65 && z<-2.5 && z>-7.2) // Samet hygiene module footprint
    || centers.some(cx=>Math.hypot(x-cx,z)<radius+.25)
    || (Math.abs(z)<1.46 && Math.abs(x)<9)
    || locks.some(lock=>Math.abs(x-lock.x)<1.14 && z>2.85 && z<5.34)

  // Host layout: standalone comms pad; cable geometry must not turn the whole route into a solid AABB.
  const comms = createCommsStation(scene,getTerrainHeight)
  baseObstacles.push(new T.Box3(new T.Vector3(COMMS_PAD.x-COMMS_PAD.radius,-1,COMMS_PAD.z-COMMS_PAD.radius),
    new T.Vector3(COMMS_PAD.x+COMMS_PAD.radius,16,COMMS_PAD.z+COMMS_PAD.radius)))
  const solar = addSolarFarm(T, scene, getTerrainHeight, baseObstacles,{greenhouse:greenhouseSite,water:waterSite})

  scene.add(colonyGroup)

  terrainMesh.name='Ihan_plain'; colonyGroup.name='Ihan_pressurised_habitat';
  terrainMesh.userData.heightAt=getTerrainHeight;
  return {solar, comms, greenhouseSite, ground:terrainMesh,habitat:colonyGroup,obstacles:baseObstacles,indoorObstacles,locks,floorY,entryZ:6.65,
    isInsideFloor:insideZone,isHabitatBlocked:outsideObstacle,
    blocksFootprint(x,z,hx,hz){return centers.some(cx=>Math.abs(x-cx)<radius+hx && Math.abs(z)<radius+hz)
      || baseObstacles.some(b=>x+hx>b.min.x && x-hx<b.max.x && z+hz>b.min.z && z-hz<b.max.z)},
    views:{panorama:{position:[-2.2,getTerrainHeight(-2.2,28)+2,28],target:[0,floorY+2.35,1]},
      base:{position:[24,16,30],target:[4,1,0]},solar:{position:[solar.x0+30,solar.level+36,solar.z0+46],target:[solar.x0,solar.level,solar.z0]},
      comms:{position:[-55,12,-48],target:[COMMS_PAD.x,7,COMMS_PAD.z]},
      overview:{position:[104,125,-170],target:[-12,0,-20]},
      pad:{position:[29,35,35],target:[0,0,18]}},
    dispose(){solar.dispose();surfaceDetail.dispose();regolithPhoto.dispose()}
  };
}
