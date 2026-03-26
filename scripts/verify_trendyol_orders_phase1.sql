-- Örnek doğrulama: aktif mağaza sipariş özeti (storeId'yi kendi değerinizle değiştirin).
-- SELECT id, name, slug FROM "Store" LIMIT 5;

SELECT COUNT(*) AS marketplace_order_count
FROM "MarketplaceOrder"
WHERE "storeId" = 'YOUR_STORE_UUID_HERE'::uuid;

SELECT "orderNumber", "shipmentPackageId", "packageStatus", "orderDate", "lastFetchedAt"
FROM "MarketplaceOrder"
WHERE "storeId" = 'YOUR_STORE_UUID_HERE'::uuid
ORDER BY "orderDate" DESC
LIMIT 20;

SELECT COUNT(*) AS line_count
FROM "MarketplaceOrderLine" l
JOIN "MarketplaceOrder" o ON o."id" = l."orderId"
WHERE o."storeId" = 'YOUR_STORE_UUID_HERE'::uuid;
