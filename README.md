# Mars’a İlk Koloni — Roket ve Uçuş

**Sorumlu: Emre**

Oyuncunun Dünya’da hazırlık yapıp üç astronotla Mars’a ulaşmasını geliştir.

- [ ] Roket ve yük seçimi ekranı yap. Kütle ve bütçeyi anlık göster, sınır aşılırsa nedenini açıkla.
- [ ] Kalkış ve üç turluk yolculuk akışını yaz. Bir güç arızasında oyuncu bilim cihazını kapatsın veya yedek parça harcasın.
- [ ] Mars’a inişte yakın ve engebeli alan ile uzak ve düz alan arasında seçim sun. İnişin yakıt veya yüzey enerjisi üzerindeki maliyetini raporla.
- [ ] İniş sonunda aşağıdaki veriyi Samet’in oyun akışına ver. Tüketilen erzak ve parçalar koloniye kalan miktarlarıyla ulaşmalı.

**İlk teslim:** Tek roket, bir yolculuk olayı ve bir inişle çalışan demo. Kütle sınırını aşan ve güvenle inen birer yükü deneyin.

## Ortak iniş verisi

Emre üretir, Samet aktarır, İhan koloni başlangıcında okur. İlk entegrasyon için aynı örneği kullanın. Sayılar oyun birimidir.

```json
{
  "crew": [
    { "id": "astronaut-1", "health": 100 },
    { "id": "astronaut-2", "health": 100 },
    { "id": "astronaut-3", "health": 100 }
  ],
  "supplies": { "food": 12, "water": 12, "oxygen": 12, "spareParts": 1 },
  "modules": ["habitat", "solarPanel", "battery", "oxygenUnit", "waterRecycler", "greenhouse"],
  "landingSite": "flat",
  "surfaceEnergy": 8
}
```

Ortak alanları değiştirmeden önce üç kişi birlikte karar versin.

[Ekip repoları](https://github.com/orgs/NASAYarismasi/repositories)

## Ortak 3D geliştirme planı

- **Aday teknik temel:** Vite + Three.js, JavaScript ES modülleri. Üç ekip üyesi aynı paket sürümünü kullanır. Samet ana uygulamayı ve sahne geçişlerini yönetir.
- **Model biçimi:** Blender’da içe al, ölçeği ve geometriyi kontrol et, glTF/GLB olarak dışa aktar. Three.js sahnelerinde metre ve Y-yukarı kullan. Bir modelin kaynak URL’sini, kullanım koşullarını ve yapılan düzenlemeleri kaydet. [NASA medya kullanım kuralları](https://www.nasa.gov/nasa-brand-center/images-and-media/)
- **Görev bağlamı:** SLS ve Orion gerçek araçlardan alınan görsel referanslardır. Mars transfer aracı, insanlı iniş aracı ve yüzey üssü oyun için tasarlanan konseptlerdir.
- **Entegrasyon:** README’deki ortak iniş JSON’u korunur. Uçuş sahnesi başarılı inişte bu veriyi döndürür, koloni aynı nesneyi alır. Sahne kapatılırken olay dinleyicileri, animasyonlar ve GPU kaynakları temizlenir.
- **İlk ortak demo:** 3D kalkış → yolculuk kararı → 3D iniş → üç modül kur → bir sol ilerlet → görev raporu. Modeli yüklenemeyen bir sahne hata bilgisi ve yeniden deneme sunar.

## Atanan GitHub görevleri

- [NASA roket, kapsül ve astronot modellerini hazırla](https://github.com/NASAYarismasi/Emre/issues/1)
- [3D kalkış ve Mars transfer sahnelerini geliştir](https://github.com/NASAYarismasi/Emre/issues/2)
- [Mars inişini ve koloniye veri teslimini tamamla](https://github.com/NASAYarismasi/Emre/issues/3)

## 3D kalkış prototipi

```powershell
npm ci
npm run dev
```

Terminaldeki yerel adresi açıp **Göreve gir** seçeneğini seçin. **WASD** ile yürüyün, sahneye tıklayıp fareyle veya ok tuşlarıyla bakın. Yeşil kalkış paneline yaklaşınca **E** ile fırlatmayı başlatın. Kabinde kırmızı güç paneline yürüyüp **E** ile sistemi açın. **Q** kol bilgisayarını açar ve kapatır. **F** tam ekran, **Esc** fare kilidinden çıkış. Gömülü tarayıcıda fare kilidi çalışmazsa sürükleyerek veya oklarla bakabilirsiniz.


SLS ve Orion, README’deki NASA STL kaynaklarından Blender’da sadeleştirilip GLB’ye çevrildi. NASA astronot GLB’si kendi Draco sıkıştırmasıyla yüklü. Bu önizleme için yaklaşık model ölçekleri ve animasyon profili kullanılıyor. Kol bilgisayarı şimdilik süre ve aktif adımı gösteriyor. Mars inişi ve fizik hesabı sonraki aşama.


## Dünya–Mars uçuş modeli

**1** dış kamera, **2** kabin kamerası, **3** Güneş merkezli rota, **P** zaman akışını duraklatır. Görev park yörüngesi, transfer, Mars yakalama, motorlu iniş ve yüzey teması aşamalarını içerir.

- Transfer modeli dairesel ve eş düzlemli gezegen yörüngeleri varsayar. Kepler denklemiyle zaman boyunca konum, vis-viva ile Güneş’e göre hız hesaplanır. İlk açı yaklaşık 44,34°, süre 258,87 gündür. [NASA yörünge referansı](https://science.nasa.gov/learn/basics-of-space-flight/chapter4-1/)
- İdeal darbeli manevralarda 200 km Dünya park yörüngesinden yaklaşık 3,61 km/s çıkış ve 250 km dairesel Mars yörüngesine yaklaşık 2,10 km/s yakalama deltası hesaplanır. Gerçek görev tarihleri, eğim, atmosfer, motor eylemleri ve yakıt lojistiği bu modelde çözülmez. Mars yakalama ile yüzey inişi arasında yörüngeden çıkış ayrı bir manevra olarak tasarlanacak.
- Kalkış, egzoz, atmosfer geçişi ve motorlu inişin gösterimi şimdilik ölçekli mühendislik simülasyonu yerine temsili animasyon profilleriyle çalışır. Orion geometrisi varış sahnesinde konsept iniş aracının yerini tutuyor.
- [Odyssey13](https://github.com/velluz-dev/Odyssey13) aynı yarışmadan 2D transfer örneği. Depoda yeniden kullanım lisansı görünmedi. [2025 3D Space Apps projesi](https://github.com/miguel-pramos/nasa-space-apps-2025) MIT lisanslı Godot koloni prototipi. [Orbiter](https://github.com/orbitersim/orbiter) MIT lisanslı C++ uçuş simülatörü. Bu PR’de bu projelerden kod alınmadı.
