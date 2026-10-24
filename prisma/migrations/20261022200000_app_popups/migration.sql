-- Popups in der Mitarbeiter-App (Inhalt aus der DB, lib/app-popups.ts).
-- Rein additiv.

-- CreateTable
CREATE TABLE "AppPopup" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "titleEn" TEXT,
    "bodyEn" TEXT,
    "imageUrl" TEXT,
    "buttonLabel" TEXT,
    "buttonLabelEn" TEXT,
    "buttonUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppPopup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPopupDismissal" (
    "id" TEXT NOT NULL,
    "popupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppPopupDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppPopup_active_priority_idx" ON "AppPopup"("active", "priority");

-- CreateIndex
CREATE INDEX "AppPopupDismissal_userId_idx" ON "AppPopupDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppPopupDismissal_popupId_userId_key" ON "AppPopupDismissal"("popupId", "userId");

-- AddForeignKey
ALTER TABLE "AppPopupDismissal" ADD CONSTRAINT "AppPopupDismissal_popupId_fkey" FOREIGN KEY ("popupId") REFERENCES "AppPopup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppPopupDismissal" ADD CONSTRAINT "AppPopupDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

