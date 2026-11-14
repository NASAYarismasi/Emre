# Koloni performansı

Ölçüm: Chrome / ANGLE D3D11, 1440×900, piksel oranı 1, `render_game_to_text().rendering`. Ölçüm yapılan GPU, dizüstünün **dahili AMD Radeon**'u. RTX 3050 daha hızlıdır.

| Durum | Çizim çağrısı | Üçgen | CPU ms/kare | GPU ms/kare |
|---|---|---|---|---|
| İhan'ın tesisleri eklendikten sonra | 3.059 | 2,49 M | 20,4 | 19,0 |
| Statik parçalar birleştirildikten sonra (2026-11-14) | **987** | 2,50 M | **5,5** | **13,8** |
| İhan ed79956: sera kamerası, kablolar ve inverterlerle (2026-11-15) | **986** | 2,42 M | 7,7 | 19,5 |

2026-11-15 kontrolü: Chromium / `--use-gl=angle`, 1440×900, piksel oranı 1. Sekiz kamera 74–986 çizim çağrısı; ilk FPS görünümü 1.021. Ölçümler `docs/screenshots/ihan-merge-performance.json` ve görüntülerin yanındaki JSON dosyalarında. CPU/GPU alanları mevcut gözlem kancasının anlık değerleridir; sabit FPS garantisi veya ayrıntılı GPU profili değildir. Güneş masalarının instancing'i korundu; yeni kablo/kabinler `batchStaticLeaves` ile birleştirildi. Hareketli şalter ile hava kilidi kapıları canlı kalır.

## Yapılanlar
- **Statik parçaları birleştirme:** `findAnimatedObjects` ve `batchStaticLeaves` (`src/colony/scene/static-model.mjs`).
  - İhan'ın kendi API'si (`setAirlock`, `setNight`, `update`, `frame`) bir kez çalıştırılır. Konumu değişen her nesne (sera kapıları, hava tesisi fanları, su matkabı) canlı kalır.
  - Geri kalan statik yaprak parçalar malzemeye göre birleştirilir. Malzemeler paylaşıldığı için LED ve gösterge renk değişimleri çalışmaya devam eder.
  - Test: `tests/colony-batching.test.js`.
- **Kubbeler, tüneller ve 108 ufuk tepesi** birleştirildi.
- **Güneş tarlası:** 390 parça → 5 InstancedMesh.
- **Sera:** yatak başına nokta ışıklar kaldırıldı; emissive LED panelleri duruyor.
- **Harici GPU:** Koloni renderer'ı `powerPreference: 'high-performance'` ister. Windows'ta Chrome'u yine de *Ayarlar → Ekran → Grafik → Yüksek performans* ile RTX'e zorlayın.

## Kalan
- **Üçgen sayısı (~2,5 M):** NASA GLB'leri (Perseverance, InSight, ekip astronotu ×3) ve sera bitki örnekleri. Mesafeye göre basitleştirilmiş LOD sonraki adım.
