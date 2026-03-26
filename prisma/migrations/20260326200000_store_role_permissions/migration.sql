-- Store-scoped role permission overlays (per tenant, does not mutate global RolePermission)

CREATE TABLE "StoreRolePermission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storeId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "isGranted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreRolePermission_storeId_roleId_permissionId_key" ON "StoreRolePermission"("storeId", "roleId", "permissionId");
CREATE INDEX "StoreRolePermission_storeId_roleId_idx" ON "StoreRolePermission"("storeId", "roleId");

ALTER TABLE "StoreRolePermission" ADD CONSTRAINT "StoreRolePermission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreRolePermission" ADD CONSTRAINT "StoreRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreRolePermission" ADD CONSTRAINT "StoreRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
