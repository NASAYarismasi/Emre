# Mars’a İlk Koloni · Emre’nin çalışma notları

## Kararlaştırılanlar

- Üç astronot Dünya’dan roketle kalkacak, Mars’a ulaşacak ve yüzeyde bir koloni kuracak. Oyuncu kalkıştan önce ekipman seçip Mars’ta aynı envanterle çalışacak.
- Oyun 3D olacak. Blender model hazırlamak için kullanılacak. Dünya’dan kalkış ve kabin sahnelerinde NASA’nın SLS, Orion ve astronot modellerinden yararlanacağız.
- Astronotun bileğinde bir görev bilgisayarı olacak. Uçuşta görev süresi, itici madde ve erzak, yüzeyde sol sayacı, batarya, su, oksijen ve aktif görev görünecek.

## Yapılan çalışma

Resmî NASA dosyaları indirildi ve biçimleri kontrol edildi. Ekip aynı kaynakları aşağıdan alabilir.

| Model | Dosya | Kullanım |
| --- | --- | --- |
| [SLS](https://science.nasa.gov/3d-resources/space-launch-system-sls/) | ZIP içinde STL | Kalkışta roketin dış geometrisi |
| [Orion](https://science.nasa.gov/3d-resources/orion-capsule/) | Orion Capsule (no fbc).stl | Kapsülün dış geometrisi |
| [Astronot](https://science.nasa.gov/3d-resources/astronaut/) | Astronaut.glb | Üç kişilik mürettebat için kaynak model |

SLS ve Orion’un ölçek ve malzemeleri Blender’da hazırlanacak. Kabin içi, kol bilgisayarı, Mars transfer aracı ve insanlı iniş aracı için oyun sahneleri veya konsept modeller hazırlanacak. Kaynak NASA dosyaları ve sahneye hazır GLB’ler ayrı tutulacak. [NASA medya kullanım rehberi](https://www.nasa.gov/nasa-brand-center/images-and-media/)

## Tartışmaya açık uygulama taslağı

- İlk demo Vite + Three.js ile localhost’ta çalışır. Samet’in reposu entegre oyun giriş noktası olur. Jüri bağlantısı gerekiyorsa statik build yayımlanır.
- Kol bilgisayarı ve oyun arayüzü aynı görev durumunu okur. Örnek kontrol: yolda kullanılan bir yedek parça Mars’a inildiğinde hem kol bilgisayarında hem koloni envanterinde eksilmiş görünür.
- Uçuş için ideal roket denklemiyle manevra bütçesi hesaplanabilir. Animasyon zaman çizgisi ve gerçek araç parametreleri ayrıca belgelenir. Kolonide üretim, tüketim ve stok dengesi ile W/Wh birimleri test edilir. Kaynaklı değerler ve oyun varsayımları model girdilerinde belirtilir. [NASA ideal roket denklemi](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/)
- İlk ortak testte aynı toz fırtınasını iki batarya seçimiyle oynayıp farkı görev bilgisayarında ve sonuç raporunda gösteririz.

## Sıradaki işler

- **Emre:** [Modelleri hazırla](https://github.com/NASAYarismasi/Emre/issues/1), [uçuşu kur](https://github.com/NASAYarismasi/Emre/issues/2), [iniş verisini teslim et](https://github.com/NASAYarismasi/Emre/issues/3).
- **İhan:** Örnek iniş envanteriyle [Mars arazisi ve üs modüllerini](https://github.com/NASAYarismasi/-lhan/issues/1) hazırla ve kaynak döngüsünü test et.
- **Samet:** [GLB yükleme ve ortak sahne altyapısını](https://github.com/NASAYarismasi/Samet/issues/1) kur, ardından aynı görev durumunu uçuş, yüzey ve bilek ekranına bağla.

[Ekip kararları ve geliştirme günlüğü](https://github.com/NASAYarismasi/Samet/issues/4)
