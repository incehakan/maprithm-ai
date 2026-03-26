export type HealthIssue = {
  field: string;
  label: string;
  severity: "critical" | "warning" | "info";
  message: string;
};

export type ProductHealthResult = {
  productId: string;
  productName: string;
  healthScore: number;
  issues: HealthIssue[];
  issueCount: number;
  hasCriticalIssues: boolean;
  status: string;
};

export type ProductForHealth = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  sku: string | null;
  price: number;
  stock: number;
  seoDescription: string | null;
  tags: string | null;
  status: string;
};

export type HealthSummary = {
  totalProducts: number;
  totalWithIssues: number;
  missingSeo: number;
  missingPrice: number;
  missingStock: number;
  missingCategory: number;
  missingBrand: number;
  missingSku: number;
  missingDescription: number;
  missingTags: number;
  draftProducts: number;
  averageHealthScore: number;
};

const HEALTH_RULES: {
  field: string;
  label: string;
  check: (p: ProductForHealth) => boolean;
  severity: "critical" | "warning" | "info";
  message: string;
  weight: number;
}[] = [
  {
    field: "name",
    label: "Ürün Adı",
    check: (p) => !p.name || p.name.trim().length < 3,
    severity: "critical",
    message: "Ürün adı boş veya çok kısa (min 3 karakter)",
    weight: 15
  },
  {
    field: "description",
    label: "Açıklama",
    check: (p) => !p.description || p.description.trim().length < 30,
    severity: "warning",
    message: "Açıklama boş veya çok kısa (min 30 karakter)",
    weight: 10
  },
  {
    field: "category",
    label: "Kategori",
    check: (p) => !p.category || p.category.trim().length === 0,
    severity: "warning",
    message: "Kategori belirtilmemiş",
    weight: 10
  },
  {
    field: "brand",
    label: "Marka",
    check: (p) => !p.brand || p.brand.trim().length === 0,
    severity: "info",
    message: "Marka belirtilmemiş",
    weight: 5
  },
  {
    field: "sku",
    label: "SKU",
    check: (p) => !p.sku || p.sku.trim().length === 0,
    severity: "info",
    message: "SKU (stok kodu) belirtilmemiş",
    weight: 5
  },
  {
    field: "price",
    label: "Fiyat",
    check: (p) => p.price === null || p.price === undefined || p.price <= 0,
    severity: "critical",
    message: "Fiyat belirtilmemiş veya 0",
    weight: 15
  },
  {
    field: "stock",
    label: "Stok",
    check: (p) => p.stock === null || p.stock === undefined || p.stock <= 0,
    severity: "warning",
    message: "Stok belirtilmemiş veya 0",
    weight: 10
  },
  {
    field: "seoDescription",
    label: "SEO Açıklaması",
    check: (p) => !p.seoDescription || p.seoDescription.trim().length === 0,
    severity: "warning",
    message: "SEO açıklaması eksik",
    weight: 10
  },
  {
    field: "tags",
    label: "Etiketler",
    check: (p) => !p.tags || p.tags.trim().length === 0,
    severity: "info",
    message: "Etiket eklenmemiş",
    weight: 5
  },
  {
    field: "status",
    label: "Durum",
    check: (p) => p.status === "draft",
    severity: "info",
    message: "Ürün taslak durumunda, yayına hazır değil",
    weight: 5
  }
];

export function checkProductHealth(product: ProductForHealth): ProductHealthResult {
  const issues: HealthIssue[] = [];
  let deduction = 0;

  for (const rule of HEALTH_RULES) {
    if (rule.check(product)) {
      issues.push({
        field: rule.field,
        label: rule.label,
        severity: rule.severity,
        message: rule.message
      });
      deduction += rule.weight;
    }
  }

  const healthScore = Math.max(0, 100 - deduction);
  const hasCriticalIssues = issues.some((i) => i.severity === "critical");

  return {
    productId: product.id,
    productName: product.name || "(İsimsiz)",
    healthScore,
    issues,
    issueCount: issues.length,
    hasCriticalIssues,
    status: product.status
  };
}

export function calculateHealthSummary(
  products: ProductForHealth[],
  healthResults: ProductHealthResult[]
): HealthSummary {
  const withIssues = healthResults.filter((r) => r.issueCount > 0);

  const missingSeo = products.filter(
    (p) => !p.seoDescription || p.seoDescription.trim().length === 0
  ).length;

  const missingPrice = products.filter(
    (p) => p.price === null || p.price === undefined || p.price <= 0
  ).length;

  const missingStock = products.filter(
    (p) => p.stock === null || p.stock === undefined || p.stock <= 0
  ).length;

  const missingCategory = products.filter(
    (p) => !p.category || p.category.trim().length === 0
  ).length;

  const missingBrand = products.filter(
    (p) => !p.brand || p.brand.trim().length === 0
  ).length;

  const missingSku = products.filter(
    (p) => !p.sku || p.sku.trim().length === 0
  ).length;

  const missingDescription = products.filter(
    (p) => !p.description || p.description.trim().length < 30
  ).length;

  const missingTags = products.filter(
    (p) => !p.tags || p.tags.trim().length === 0
  ).length;

  const draftProducts = products.filter((p) => p.status === "draft").length;

  const totalScore = healthResults.reduce((sum, r) => sum + r.healthScore, 0);
  const averageHealthScore =
    healthResults.length > 0
      ? Math.round(totalScore / healthResults.length)
      : 100;

  return {
    totalProducts: products.length,
    totalWithIssues: withIssues.length,
    missingSeo,
    missingPrice,
    missingStock,
    missingCategory,
    missingBrand,
    missingSku,
    missingDescription,
    missingTags,
    draftProducts,
    averageHealthScore
  };
}

export function getHealthScoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-600";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

export function getHealthScoreLabel(score: number): string {
  if (score >= 80) return "İyi";
  if (score >= 60) return "Orta";
  if (score >= 40) return "Zayıf";
  return "Kritik";
}
