import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import { createActivityLog } from "../services/activity-log.service";
import { TEMPLATE_VARIABLES_MAP } from "../validators/email-templates.validator";

// 🔥 Motor de validación de variables: Asegura que el HTML no use etiquetas inventadas
function validateVariables(html: string, type: string) {
  const allowedVars = TEMPLATE_VARIABLES_MAP[type]?.map(v => v.name) || [];
  const matches = html.match(/\{\{(\w+)\}\}/g) || [];
  const usedVars = matches.map(m => m.replace(/[{}]/g, ""));
  
  const invalidVars = [...new Set(usedVars.filter(v => !allowedVars.includes(v)))];
  if (invalidVars.length > 0) {
    throw new ApiError(`La plantilla usa variables no válidas para el tipo ${type}: ${invalidVars.join(", ")}`, 400);
  }
}

export async function listEmailTemplates(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const { type, isActive, search } = req.query as any;

 const where: any = {};
  if (type) where.type = type;
  if (isActive !== undefined) {
    where.isActive = (isActive === "true" || isActive === true);
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } }
    ];
  }

  // Ejecución secuencial
  const total = await prisma.emailTemplate.count({ where });
  const data = await prisma.emailTemplate.findMany({ 
    where, skip, take: limit, orderBy: { createdAt: "desc" } 
  });
  
  sendList(res, data, total, page, limit);
}

export async function getEmailTemplate(req: Request, res: Response): Promise<void> {
  const item = await prisma.emailTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!item) throw new ApiError("Plantilla no encontrada", 404, "EMAIL_TEMPLATE_NOT_FOUND");
  sendItem(res, item);
}

export async function getTemplateVariables(req: Request, res: Response): Promise<void> {
  const type = String(req.query.type);
  const variables = TEMPLATE_VARIABLES_MAP[type] || TEMPLATE_VARIABLES_MAP["CUSTOM"];
  sendItem(res, variables);
}

export async function previewTemplate(req: Request, res: Response): Promise<void> {
  const { bodyHtml, type } = req.body;
  const variables = TEMPLATE_VARIABLES_MAP[type] || TEMPLATE_VARIABLES_MAP["CUSTOM"];
  let html = bodyHtml;

  variables.forEach((v) => {
    const regex = new RegExp(`\\{\\{${v.name}\\}\\}`, "g");
    html = html.replace(regex, v.sample);
  });

  sendItem(res, { html });
}

export async function createEmailTemplate(req: Request, res: Response): Promise<void> {
  const data = req.body;
  validateVariables(data.bodyHtml, data.type);

  const item = await prisma.emailTemplate.create({
    data: { ...data, createdBy: req.user!.id }
  });
  
  await createActivityLog({ action: "CREATE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function updateEmailTemplate(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const data = req.body;
  const existing = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!existing) throw new ApiError("Plantilla no encontrada", 404);

  const checkType = data.type || existing.type;
  const checkHtml = data.bodyHtml || existing.bodyHtml;
  if (data.bodyHtml || data.type) validateVariables(checkHtml, checkType);

  const item = await prisma.emailTemplate.update({ where: { id }, data });
  await createActivityLog({ action: "UPDATE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, item);
}

export async function toggleTemplate(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { isActive } = req.body;

  const item = await prisma.emailTemplate.update({ where: { id }, data: { isActive } });
  await createActivityLog({ action: "UPDATE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, description: isActive ? "Plantilla Activada" : "Plantilla Desactivada", performedBy: req.user?.id });
  sendItem(res, item);
}

export async function duplicateTemplate(req: Request, res: Response): Promise<void> {
  const source = await prisma.emailTemplate.findUnique({ where: { id: String(req.params.id) } });
  if (!source) throw new ApiError("Plantilla no encontrada", 404);

  const item = await prisma.emailTemplate.create({
    data: {
      name: `${source.name} (Copia)`,
      type: source.type,
      description: source.description,
      subject: source.subject,
      bodyHtml: source.bodyHtml,
      isActive: false, // Las copias nacen apagadas
      createdBy: req.user!.id
    }
  });

  await createActivityLog({ action: "CREATE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, description: "Plantilla duplicada", performedBy: req.user?.id });
  sendItem(res, item, 201);
}

export async function deleteEmailTemplate(req: Request, res: Response): Promise<void> {
  const item = await prisma.emailTemplate.delete({ where: { id: String(req.params.id) } });
  await createActivityLog({ action: "DELETE", entityType: "EmailTemplate", entityId: item.id, entityLabel: item.name, performedBy: req.user?.id });
  sendItem(res, { ok: true, message: "Plantilla eliminada correctamente" });
}