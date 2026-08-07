import { prisma } from "@/lib/prisma";

/** Global referans satırlarının bağlandığı sistem mağazası (nil UUID). */
export const SYSTEM_REFERENCE_STORE_ID =
  "00000000-0000-0000-0000-000000000000";

/** MarketplaceBrand/Category/Attribute FK'si için sistem Store satırını garanti eder. */
export async function ensureSystemReferenceStore(): Promise<void> {
  await prisma.store.upsert({
    where: { id: SYSTEM_REFERENCE_STORE_ID },
    create: {
      id: SYSTEM_REFERENCE_STORE_ID,
      name: "System Reference Store",
      slug: "system-reference",
      status: "active",
      currency: "TRY",
      locale: "tr-TR"
    },
    update: {
      name: "System Reference Store",
      status: "active"
    }
  });
}
