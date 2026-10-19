-- CreateTable
CREATE TABLE "quotation_links" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRequestedAt" TIMESTAMP(3),

    CONSTRAINT "quotation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_link_events" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "device" TEXT,
    "contactName" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_link_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_quotation_sends" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "scheduled_quotation_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_links_quotationId_idx" ON "quotation_links"("quotationId");

-- CreateIndex
CREATE INDEX "quotation_link_events_linkId_createdAt_idx" ON "quotation_link_events"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "scheduled_quotation_sends_status_sendAt_idx" ON "scheduled_quotation_sends"("status", "sendAt");

-- CreateIndex
CREATE INDEX "scheduled_quotation_sends_quotationId_idx" ON "scheduled_quotation_sends"("quotationId");

-- AddForeignKey
ALTER TABLE "quotation_links" ADD CONSTRAINT "quotation_links_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_link_events" ADD CONSTRAINT "quotation_link_events_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "quotation_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_quotation_sends" ADD CONSTRAINT "scheduled_quotation_sends_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
