-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SystemReferenceSyncLog" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" JSONB,
    "message" TEXT,
    "triggeredByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemReferenceSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemReferenceSyncLog_action_createdAt_idx" ON "SystemReferenceSyncLog"("action", "createdAt");
CREATE INDEX "SystemReferenceSyncLog_status_createdAt_idx" ON "SystemReferenceSyncLog"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SystemReferenceSyncLog"
ADD CONSTRAINT "SystemReferenceSyncLog_triggeredByUserId_fkey"
FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
