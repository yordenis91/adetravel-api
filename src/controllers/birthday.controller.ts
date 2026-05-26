import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
// Ajusta la ruta según dónde tengas tu archivo email.service.ts
import { sendTemplateEmail } from "../services/email.service"; 

export async function sendBirthdayEmails(req: Request, res: Response): Promise<void> {
  try {
    const { clientIds } = req.body;
    const currentYear = new Date().getFullYear();

    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } }
    });

    for (const client of clients) {
      if (client.lastBirthdayEmailYear === currentYear || !client.email) continue;

      // 🎨 Plantilla HTML de respaldo (Fallback) con interpolación de variables
      const fallbackHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #1e293b;">¡Feliz Cumpleaños, {{firstName}}! 🎉</h1>
          </div>
          <div style="color: #475569; font-size: 16px; line-height: 1.6;">
            <p>De parte de todo el equipo de <strong>ADE Travel</strong>, queremos desearte un día espectacular rodeado de tus seres queridos.</p>
            <p>Que este nuevo año de vida esté lleno de nuevas aventuras, destinos por descubrir y momentos inolvidables.</p>
            <p>¡Esperamos seguir acompañándote a recorrer el mundo!</p>
          </div>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 14px;">
            <p>Con cariño, el equipo de ADE Travel ✈️</p>
          </div>
        </div>
      `;

      // 🔥 Magia Enterprise: Usamos tu servicio de plantillas dinámicas
      await sendTemplateEmail({
        type: "BIRTHDAY_GREETING",
        to: client.email,
        variables: {
          firstName: client.firstName || "viajero",
          lastName: client.lastName || ""
        },
        fallbackSubject: "¡Feliz Cumpleaños de parte de ADE Travel, {{firstName}}! 🎂",
        fallbackHtml: fallbackHtml
      });

      // Registrar que ya se le envió este año
      await prisma.client.update({
        where: { id: client.id },
        data: { lastBirthdayEmailYear: currentYear }
      });
    }

    res.status(200).json({ message: "Correos enviados exitosamente" });
  } catch (error) {
    console.error("Error enviando cumpleaños:", error);
    res.status(500).json({ message: "Error al enviar los correos de cumpleaños" });
  }
}