-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sourceXmlFeedSourceId" UUID;

-- AlterTable
ALTER TABLE "XmlFeedSource" ADD COLUMN     "returnAddressId" TEXT,
ADD COLUMN     "shipmentAddressId" TEXT;
