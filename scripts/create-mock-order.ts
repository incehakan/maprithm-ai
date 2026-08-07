import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst();
  
  if (!store) {
    console.error("Hiç mağaza (store) bulunamadı. Lütfen önce bir mağaza oluşturun.");
    process.exit(1);
  }

  console.log(`Mağaza bulundu: ${store.id} - ${store.name}`);

  // Create mock order directly with raw query if needed, or structured Prisma
  const existingOrder = await prisma.marketplaceOrder.findFirst({
    where: { shipmentPackageId: "TEST-PKG-999999" }
  });

  if (existingOrder) {
    console.log("Mock sipariş zaten var: ", existingOrder.id);
    return;
  }

  const mockOrder = await prisma.marketplaceOrder.create({
    data: {
      storeId: store.id, // Using storeId directly
      platform: "trendyol",
      shipmentPackageId: "TEST-PKG-999999",
      orderNumber: "TEST-ORD-999999",
      rootOrderNumber: "TEST-ROOT-999999",
      packageStatus: "Created",
      orderDate: new Date(),
      cargoTrackingNumber: "TRK-999999",
      cargoProviderName: "Sürat Kargo",
      cargoProviderCode: "9",
      customerFirstName: "Test",
      customerLastName: "Kullanıcı",
      customerId: "123456789",
      totalPrice: 1500.5,
      currency: "TRY",
      isTestRecord: true,
      deliveryAddressType: "Home",
      
      lines: {
        create: [
          {
            storeId: store.id, // Make sure line also gets storeId directly
            lineId: "10001",
            barcode: "TEST-BARCODE-1",
            stockCode: "TEST-SKU-1",
            productName: "Test Ürün 1",
            quantity: 2,
            lineUnitPrice: 500,
            lineStatus: "Created",
          },
          {
            storeId: store.id, // Make sure line also gets storeId directly
            lineId: "10002",
            barcode: "TEST-BARCODE-2",
            stockCode: "TEST-SKU-2",
            productName: "Test Ürün 2",
            quantity: 1,
            lineUnitPrice: 500.5,
            lineStatus: "Created",
          }
        ]
      }
    }
  });

  console.log("Mock sipariş başarıyla oluşturuldu:");
  console.log(`Sipariş ID: ${mockOrder.id}`);
  console.log(`Paket Numarası: ${mockOrder.shipmentPackageId}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });