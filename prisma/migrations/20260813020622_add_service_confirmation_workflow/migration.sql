-- Fase 1: modelo de datos granular (Servicio, Confirmación, flujo de 17 estados compartido)
-- Ver documento de requisitos ADE Travel v3.2, secciones 3-6.

-- ============================================================================
-- 1. Nuevos tipos enumerados
-- ============================================================================

CREATE TYPE "ServiceType" AS ENUM ('SEGURO', 'VISA', 'ALOJAMIENTO', 'PASAJE_AEREO', 'ARRIENDO_AUTO', 'EXCURSION', 'TRASLADO', 'CRUCERO', 'CIRCUITO');

CREATE TYPE "WorkflowStatus" AS ENUM ('RECEPCIONADA', 'SERVICIOS_ASIGNADOS_PARA_COTIZAR', 'ENVIADO_A_PROVEEDOR', 'COTIZADO_POR_PROVEEDOR', 'COTIZADO_POR_ADETRAVEL', 'ENVIADO_AL_CLIENTE', 'ACEPTADA_POR_CLIENTE', 'ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR', 'CONFIRMADA_POR_PROVEEDOR', 'ENVIADA_CONFIRMACION_CLIENTE', 'ENVIADA_SOLICITUD_PAGO_CLIENTE', 'PAGADO_POR_CLIENTE', 'PAGADO_AL_PROVEEDOR', 'VOUCHER_EMITIDO', 'VOUCHER_ENTREGADO', 'VENDIDA', 'CANCELADA');

-- ============================================================================
-- 2. Migración de "requests"."status" de RequestStatus (5 valores) a WorkflowStatus
--    (17 valores), preservando los datos existentes con un mapeo aproximado:
--      RECEPCIONADA -> RECEPCIONADA
--      COTIZADA     -> COTIZADO_POR_ADETRAVEL
--      CONFIRMADA   -> CONFIRMADA_POR_PROVEEDOR
--      VENDIDA      -> VENDIDA
--      CANCELADA    -> CANCELADA
-- ============================================================================

ALTER TABLE "requests" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "requests" ADD COLUMN "status_new" "WorkflowStatus";

UPDATE "requests" SET "status_new" = (
  CASE "status"::text
    WHEN 'RECEPCIONADA' THEN 'RECEPCIONADA'
    WHEN 'COTIZADA' THEN 'COTIZADO_POR_ADETRAVEL'
    WHEN 'CONFIRMADA' THEN 'CONFIRMADA_POR_PROVEEDOR'
    WHEN 'VENDIDA' THEN 'VENDIDA'
    WHEN 'CANCELADA' THEN 'CANCELADA'
    ELSE 'RECEPCIONADA'
  END
)::"WorkflowStatus";

ALTER TABLE "requests" ALTER COLUMN "status_new" SET NOT NULL;
ALTER TABLE "requests" DROP COLUMN "status";
ALTER TABLE "requests" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "requests" ALTER COLUMN "status" SET DEFAULT 'RECEPCIONADA';

DROP TYPE "RequestStatus";

-- ============================================================================
-- 3. Nuevas columnas de soporte
-- ============================================================================

ALTER TABLE "quotations" ADD COLUMN "serviceId" TEXT;

ALTER TABLE "system_config" ADD COLUMN "confirmationNumberPrefix" TEXT DEFAULT 'CONF',
ADD COLUMN "serviceNumberPrefix" TEXT DEFAULT 'SRV';

-- ============================================================================
-- 4. Tabla "services" (Servicio, sección 5 del documento)
-- ============================================================================

CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "serviceNumber" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'RECEPCIONADA',
    "providerId" TEXT,
    "clientId" TEXT,
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "details" JSONB NOT NULL,
    "cancellationReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "services_serviceNumber_key" ON "services"("serviceNumber");

ALTER TABLE "services" ADD CONSTRAINT "services_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 5. Tabla "confirmations" (Confirmación, reglas 10 y 14, sección 4.12)
-- ============================================================================

CREATE TABLE "confirmations" (
    "id" TEXT NOT NULL,
    "confirmationNumber" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "serviceId" TEXT,
    "providerId" TEXT NOT NULL,
    "providerConfirmationNumber" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "validUntil" TEXT,
    "exchangeRate" DOUBLE PRECISION,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "confirmations_confirmationNumber_key" ON "confirmations"("confirmationNumber");

ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
