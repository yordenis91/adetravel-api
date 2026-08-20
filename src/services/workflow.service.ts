import { prisma } from "../lib/prisma";
import { BUBBLE_UP_STATUSES, CASCADE_DOWN_STATUSES, WorkflowStatus, isAtOrAfter } from "../validators/workflow-status";

/**
 * Aplica el mismo estado a todos los Servicios de una Solicitud.
 * Se usa cuando el estado se decide a nivel Solicitud (isPackage=true, o un estado
 * de tipo "desciende a servicios" como ACEPTADA_POR_CLIENTE/CANCELADA/PAGADO_POR_CLIENTE/
 * VOUCHER_ENTREGADO/VENDIDA). No falla si la solicitud no tiene servicios (caso paquete).
 */
export async function cascadeStatusToServices(requestId: string, status: WorkflowStatus): Promise<void> {
  await prisma.service.updateMany({ where: { requestId }, data: { status } });
}

/**
 * Tras cambiar el estado de un Servicio, revisa si TODOS los servicios de su Solicitud
 * alcanzaron ese mismo estado y, de ser así, "burbujea" el estado hacia la Solicitud.
 * No aplica a solicitudes de tipo paquete (ahí el flujo se maneja al revés, ver
 * cascadeStatusToServices).
 */
export async function bubbleStatusToRequestIfComplete(requestId: string, status: WorkflowStatus): Promise<void> {
  if (!BUBBLE_UP_STATUSES.includes(status)) return;

  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { isPackage: true, status: true } });
  if (!request || request.isPackage) return;

  const [totalServices, matchingServices] = await Promise.all([
    prisma.service.count({ where: { requestId } }),
    prisma.service.count({ where: { requestId, status } }),
  ]);

  if (totalServices > 0 && totalServices === matchingServices && request.status !== status) {
    await prisma.request.update({ where: { id: requestId }, data: { status } });
  }
}

/**
 * Sincroniza el estado de una Solicitud hacia sus Servicios cuando corresponde
 * (paquete, o estado de tipo "desciende a servicios").
 */
export async function syncServicesOnRequestStatusChange(
  requestId: string,
  status: WorkflowStatus,
  isPackage: boolean
): Promise<void> {
  if (isPackage || CASCADE_DOWN_STATUSES.includes(status)) {
    await cascadeStatusToServices(requestId, status);
  }
}

/**
 * Avanza el flujo de trabajo hacia `targetStatus` como efecto colateral de otra acción
 * (crear/enviar/aceptar una Cotización, registrar una Confirmación, completar un Pago...).
 * Si `serviceId` viene informado, actúa sobre ese Servicio (y burbujea a la Solicitud si
 * corresponde); si no, actúa directamente sobre la Solicitud (caso Paquete) y cascada hacia
 * sus Servicios. Nunca retrocede el estado ni reactiva una entidad Cancelada.
 */
export async function advanceWorkflowStatus(
  requestId: string,
  serviceId: string | null | undefined,
  targetStatus: WorkflowStatus
): Promise<void> {
  if (serviceId) {
    const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { status: true } });
    if (service && service.status !== "CANCELADA" && !isAtOrAfter(service.status, targetStatus)) {
      await prisma.service.update({ where: { id: serviceId }, data: { status: targetStatus } });
      await bubbleStatusToRequestIfComplete(requestId, targetStatus);
    }
    return;
  }

  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true, isPackage: true } });
  if (request && request.status !== "CANCELADA" && !isAtOrAfter(request.status, targetStatus)) {
    await prisma.request.update({ where: { id: requestId }, data: { status: targetStatus } });
    // Solo desciende a los Servicios si el estado es de los que la regla de negocio marca como
    // "cascada obligatoria" (p.ej. ACEPTADA_POR_CLIENTE) o si la Solicitud es Paquete (regla #5:
    // en Paquete todo se gestiona a nivel Solicitud). Estados puramente de Solicitud como
    // ENVIADO_AL_CLIENTE (sección 4.8: exige que los Servicios YA estén en COTIZADO_POR_ADETRAVEL,
    // pero no los hace avanzar) no deben tocar Service.status cuando no es Paquete.
    await syncServicesOnRequestStatusChange(requestId, targetStatus, request.isPackage);
  }
}
