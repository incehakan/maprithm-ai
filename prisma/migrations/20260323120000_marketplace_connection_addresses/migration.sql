-- Trendyol gönderim / iade adresi seçimi (createProduct için)
ALTER TABLE "MarketplaceConnection" ADD COLUMN IF NOT EXISTS "shipmentAddressId" TEXT;
ALTER TABLE "MarketplaceConnection" ADD COLUMN IF NOT EXISTS "returnAddressId" TEXT;
