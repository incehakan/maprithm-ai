type DemoProduct = {
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  brand: string | null;
  sku: string | null;
  status: string;
  seoDescription: string | null;
  tags: string | null;
  costPrice: number | null;
  commissionRate: number | null;
  cargoCost: number | null;
  vatRate: number | null;
  targetProfitRate: number | null;
};

export const DEMO_PRODUCTS: DemoProduct[] = [
  // Tam dolu, iyi ürünler
  {
    name: "Premium Pamuklu T-Shirt - Beyaz",
    description: "Yüksek kaliteli %100 pamuklu erkek t-shirt. Rahat kesim, nefes alan kumaş. Her mevsim kullanıma uygun.",
    price: 299.99,
    stock: 150,
    category: "Giyim",
    brand: "ModaTrend",
    sku: "MT-TSH-001",
    status: "active",
    seoDescription: "Premium pamuklu beyaz t-shirt. Rahat kesim, kaliteli kumaş. Erkek giyim koleksiyonu.",
    tags: "tshirt,pamuk,beyaz,erkek,casual",
    costPrice: 120,
    commissionRate: 15,
    cargoCost: 25,
    vatRate: 20,
    targetProfitRate: 40
  },
  {
    name: "Deri Spor Ayakkabı - Siyah",
    description: "Gerçek deri üst yüzey, hafif taban. Günlük kullanım için ideal spor ayakkabı.",
    price: 899.00,
    stock: 45,
    category: "Ayakkabı",
    brand: "StepMaster",
    sku: "SM-SPR-042",
    status: "active",
    seoDescription: "Deri spor ayakkabı, hafif ve konforlu. Günlük kullanım için ideal.",
    tags: "ayakkabı,spor,deri,siyah,erkek",
    costPrice: 450,
    commissionRate: 12,
    cargoCost: 35,
    vatRate: 20,
    targetProfitRate: 35
  },
  {
    name: "Akıllı Saat Pro X200",
    description: "Kalp ritmi takibi, adım sayacı, uyku analizi. Su geçirmez, 7 gün pil ömrü.",
    price: 2499.00,
    stock: 30,
    category: "Elektronik",
    brand: "TechZone",
    sku: "TZ-SW-X200",
    status: "active",
    seoDescription: "Akıllı saat Pro X200 - sağlık takibi, bildirimler, uzun pil ömrü.",
    tags: "akıllı saat,smartwatch,elektronik,sağlık",
    costPrice: 1200,
    commissionRate: 10,
    cargoCost: 20,
    vatRate: 20,
    targetProfitRate: 45
  },
  {
    name: "Organik Yüz Bakım Seti",
    description: "Doğal içerikli 4'lü yüz bakım seti: temizleyici, tonik, serum, nemlendirici.",
    price: 549.00,
    stock: 80,
    category: "Kozmetik",
    brand: "NaturaCare",
    sku: "NC-FCS-004",
    status: "active",
    seoDescription: "Organik yüz bakım seti, doğal içerikler, paraben içermez.",
    tags: "kozmetik,yüz bakım,organik,doğal",
    costPrice: 220,
    commissionRate: 18,
    cargoCost: 15,
    vatRate: 20,
    targetProfitRate: 50
  },
  {
    name: "Dekoratif Masa Lambası",
    description: "Modern tasarım, ayarlanabilir ışık yoğunluğu. Çalışma masası ve yatak odası için ideal.",
    price: 399.00,
    stock: 60,
    category: "Ev Yaşam",
    brand: "LightHome",
    sku: "LH-LMP-033",
    status: "active",
    seoDescription: "Dekoratif masa lambası, modern tasarım, ayarlanabilir ışık.",
    tags: "lamba,dekorasyon,ev,aydınlatma",
    costPrice: 180,
    commissionRate: 14,
    cargoCost: 30,
    vatRate: 20,
    targetProfitRate: 35
  },

  // Eksik SEO ve tags
  {
    name: "Kadın Kot Pantolon - Mavi",
    description: "Slim fit kadın kot pantolon. Yüksek bel, rahat hareket.",
    price: 449.00,
    stock: 90,
    category: "Giyim",
    brand: "DenimLife",
    sku: "DL-KOT-078",
    status: "active",
    seoDescription: null,
    tags: null,
    costPrice: 180,
    commissionRate: 15,
    cargoCost: 25,
    vatRate: 20,
    targetProfitRate: 40
  },
  {
    name: "Bluetooth Kulaklık",
    description: "Kablosuz kulak üstü kulaklık. Aktif gürültü engelleme, 30 saat pil.",
    price: 1299.00,
    stock: 25,
    category: "Elektronik",
    brand: "SoundMax",
    sku: "SX-BT-150",
    status: "active",
    seoDescription: null,
    tags: "kulaklık,bluetooth",
    costPrice: 650,
    commissionRate: 12,
    cargoCost: 20,
    vatRate: 20,
    targetProfitRate: 38
  },

  // Fiyatı 0 olan
  {
    name: "Hediye Paketi - Özel Tasarım",
    description: "Özel günler için hediye paketi. İçerik müşteri tercihine göre belirlenir.",
    price: 0,
    stock: 100,
    category: "Ev Yaşam",
    brand: "GiftBox",
    sku: "GB-PKT-001",
    status: "draft",
    seoDescription: "Özel tasarım hediye paketi, kişiye özel içerik.",
    tags: "hediye,paket,özel",
    costPrice: null,
    commissionRate: null,
    cargoCost: null,
    vatRate: null,
    targetProfitRate: null
  },
  {
    name: "Promosyon Ürünü - Yakında",
    description: "Yakında satışa sunulacak promosyon ürünü.",
    price: 0,
    stock: 50,
    category: "Giyim",
    brand: null,
    sku: null,
    status: "draft",
    seoDescription: null,
    tags: null,
    costPrice: null,
    commissionRate: null,
    cargoCost: null,
    vatRate: null,
    targetProfitRate: null
  },

  // Stoğu 0 olan
  {
    name: "Limited Edition Parfüm 50ml",
    description: "Sınırlı sayıda üretim, özel koleksiyon parfümü.",
    price: 1899.00,
    stock: 0,
    category: "Kozmetik",
    brand: "EssenceX",
    sku: "EX-PRF-LTD",
    status: "passive",
    seoDescription: "Limited edition parfüm, özel koleksiyon, 50ml.",
    tags: "parfüm,limited,kozmetik,lüks",
    costPrice: 800,
    commissionRate: 20,
    cargoCost: 15,
    vatRate: 20,
    targetProfitRate: 50
  },
  {
    name: "Vintage Deri Çanta",
    description: "El yapımı vintage tarz deri çanta. Sınırlı stok.",
    price: 1499.00,
    stock: 0,
    category: "Giyim",
    brand: "LeatherCraft",
    sku: "LC-BAG-VNT",
    status: "passive",
    seoDescription: "El yapımı vintage deri çanta, özel üretim.",
    tags: "çanta,deri,vintage,el yapımı",
    costPrice: 700,
    commissionRate: 15,
    cargoCost: 40,
    vatRate: 20,
    targetProfitRate: 45
  },

  // Eksik kategori/brand/sku
  {
    name: "Spor Çorap Seti (5'li)",
    description: "Pamuklu spor çorap seti. Farklı renklerde 5 adet.",
    price: 129.00,
    stock: 200,
    category: null,
    brand: null,
    sku: null,
    status: "active",
    seoDescription: "Pamuklu spor çorap seti, 5 farklı renk.",
    tags: "çorap,spor,pamuk",
    costPrice: 45,
    commissionRate: 10,
    cargoCost: 15,
    vatRate: 20,
    targetProfitRate: 50
  },
  {
    name: "Mutfak Bıçak Seti",
    description: "Profesyonel mutfak bıçak seti. Paslanmaz çelik, ergonomik sap.",
    price: 699.00,
    stock: 35,
    category: "Ev Yaşam",
    brand: null,
    sku: "BICAK-SET-01",
    status: "active",
    seoDescription: null,
    tags: null,
    costPrice: 350,
    commissionRate: 12,
    cargoCost: 30,
    vatRate: 20,
    targetProfitRate: 35
  },
  {
    name: "Kablosuz Şarj Cihazı",
    description: "Hızlı kablosuz şarj, tüm Qi uyumlu cihazlarla çalışır.",
    price: 349.00,
    stock: 70,
    category: "Elektronik",
    brand: "ChargePro",
    sku: null,
    status: "active",
    seoDescription: "Kablosuz şarj cihazı, hızlı şarj, Qi uyumlu.",
    tags: "şarj,kablosuz,elektronik",
    costPrice: 140,
    commissionRate: 10,
    cargoCost: 15,
    vatRate: 20,
    targetProfitRate: 40
  },

  // Taslak durumunda
  {
    name: "Yeni Sezon Kışlık Mont (Taslak)",
    description: "Henüz detayları belirlenmemiş kışlık mont modeli.",
    price: 1999.00,
    stock: 0,
    category: "Giyim",
    brand: "WinterStyle",
    sku: null,
    status: "draft",
    seoDescription: null,
    tags: null,
    costPrice: null,
    commissionRate: null,
    cargoCost: null,
    vatRate: null,
    targetProfitRate: null
  },
  {
    name: "Akıllı Ev Asistanı (Geliştiriliyor)",
    description: "Sesli komut ile ev kontrolü. Henüz geliştirme aşamasında.",
    price: 0,
    stock: 0,
    category: "Elektronik",
    brand: "SmartHome",
    sku: "SH-AST-BETA",
    status: "draft",
    seoDescription: null,
    tags: "akıllı ev,asistan,sesli komut",
    costPrice: null,
    commissionRate: null,
    cargoCost: null,
    vatRate: null,
    targetProfitRate: null
  },

  // Pasif durumunda
  {
    name: "Sezon Sonu - Yaz Elbisesi",
    description: "Geçen sezondan kalan yaz elbisesi. İndirimli satış.",
    price: 199.00,
    stock: 15,
    category: "Giyim",
    brand: "SummerVibes",
    sku: "SV-ELB-SS23",
    status: "passive",
    seoDescription: "Sezon sonu yaz elbisesi, indirimli fiyat.",
    tags: "elbise,yaz,indirim,kadın",
    costPrice: 100,
    commissionRate: 15,
    cargoCost: 25,
    vatRate: 20,
    targetProfitRate: 30
  },

  // Kısa açıklamalı
  {
    name: "USB Kablo",
    description: "USB-C kablo",
    price: 49.00,
    stock: 500,
    category: "Elektronik",
    brand: null,
    sku: "USB-C-1M",
    status: "active",
    seoDescription: null,
    tags: "usb,kablo",
    costPrice: 15,
    commissionRate: 8,
    cargoCost: 10,
    vatRate: 20,
    targetProfitRate: 60
  },
  {
    name: "Nemlendirici Krem",
    description: "Yüz için nemlendirici",
    price: 179.00,
    stock: 120,
    category: "Kozmetik",
    brand: "SkinGlow",
    sku: "SG-NEM-50",
    status: "active",
    seoDescription: "Nemlendirici krem, günlük kullanım.",
    tags: "krem,nemlendirici,yüz bakım",
    costPrice: 70,
    commissionRate: 18,
    cargoCost: 15,
    vatRate: 20,
    targetProfitRate: 45
  }
];

export function getDemoProductCount(): number {
  return DEMO_PRODUCTS.length;
}
