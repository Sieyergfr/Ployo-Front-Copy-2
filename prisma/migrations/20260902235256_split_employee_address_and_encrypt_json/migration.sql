-- DropForeignKey
ALTER TABLE "TenantEmployee" DROP CONSTRAINT "TenantEmployee_privateAddressId_fkey";

-- DropForeignKey
ALTER TABLE "TenantEmployee" DROP CONSTRAINT "TenantEmployee_workAddressId_fkey";

-- AlterTable: Json -> String fuer die Feldverschluesselung (App-seitig,
-- siehe lib/encryption.ts, arbeitet nur auf Strings). Bestehende Werte sind
-- gueltiger JSON-Text und bleiben ueber decryptField()'s Klartext-Passthrough
-- fuer noch nicht verschluesselte Altdaten lesbar, bis sie beim naechsten
-- Speichern verschluesselt werden.
ALTER TABLE "TenantEmployee" ALTER COLUMN "emergencyContactsJson" SET DATA TYPE TEXT USING "emergencyContactsJson"::TEXT;

-- CreateTable
CREATE TABLE "EmployeeAddress" (
    "id" TEXT NOT NULL,
    "street" TEXT NOT NULL DEFAULT '',
    "houseNumber" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "careOf" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAddress_pkey" PRIMARY KEY ("id")
);

-- Datenmigration: bestehende Privat-/Arbeitsadressen (referenziert von
-- TenantEmployee.privateAddressId/workAddressId) unter gleicher ID nach
-- EmployeeAddress kopieren, bevor die neuen Fremdschluessel unten angelegt
-- werden (die sonst sofort mit einer Verletzung fehlschlagen wuerden, weil
-- die Zieltabelle sonst leer waere). Die alten Address-Zeilen bleiben
-- unangetastet liegen (verwaist, aber ohne Loeschrisiko) -- Standort-/
-- Firmenadressen in Address sind davon nicht betroffen, da laut Schema jede
-- Address-Zeile nur von genau einer 1:1-Relation referenziert wird.
INSERT INTO "EmployeeAddress" ("id", "street", "houseNumber", "postalCode", "city", "careOf", "country", "createdAt", "updatedAt")
SELECT "id", "street", "houseNumber", "postalCode", "city", "careOf", "country", "createdAt", "updatedAt"
FROM "Address"
WHERE "id" IN (
  SELECT "privateAddressId" FROM "TenantEmployee" WHERE "privateAddressId" IS NOT NULL
  UNION
  SELECT "workAddressId" FROM "TenantEmployee" WHERE "workAddressId" IS NOT NULL
);

-- AddForeignKey
ALTER TABLE "TenantEmployee" ADD CONSTRAINT "TenantEmployee_privateAddressId_fkey" FOREIGN KEY ("privateAddressId") REFERENCES "EmployeeAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmployee" ADD CONSTRAINT "TenantEmployee_workAddressId_fkey" FOREIGN KEY ("workAddressId") REFERENCES "EmployeeAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
