-- Envuelta en una transacción: si algo falla, Postgres deshace todo y no queda aplicada a medias
-- (Prisma no lo hace por su cuenta; ver OPERATIONS.md, "Cómo recuperarse de una migración fallida").
BEGIN;
-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "confirmations_requestId_idx" ON "confirmations"("requestId");

-- CreateIndex
CREATE INDEX "payments_requestId_idx" ON "payments"("requestId");

-- CreateIndex
CREATE INDEX "payments_clientId_idx" ON "payments"("clientId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "quotations_requestId_idx" ON "quotations"("requestId");

-- CreateIndex
CREATE INDEX "quotations_clientId_idx" ON "quotations"("clientId");

-- CreateIndex
CREATE INDEX "quotations_createdAt_idx" ON "quotations"("createdAt");

-- CreateIndex
CREATE INDEX "requests_clientId_idx" ON "requests"("clientId");

-- CreateIndex
CREATE INDEX "requests_status_idx" ON "requests"("status");

-- CreateIndex
CREATE INDEX "requests_createdAt_idx" ON "requests"("createdAt");

-- CreateIndex
CREATE INDEX "services_requestId_idx" ON "services"("requestId");

-- CreateIndex
CREATE INDEX "services_createdAt_idx" ON "services"("createdAt");

-- CreateIndex
CREATE INDEX "vouchers_requestId_idx" ON "vouchers"("requestId");

-- CreateIndex
CREATE INDEX "vouchers_createdAt_idx" ON "vouchers"("createdAt");

COMMIT;
