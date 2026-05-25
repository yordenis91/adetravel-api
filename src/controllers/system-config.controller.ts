import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem } from "../utils/response";
import { createActivityLog } from "../services/activity-log.service";
import axios from "axios";
import https from "https"; // Librería nativa de Node

export async function getSystemConfig(_req: Request, res: Response): Promise<void> {
  const config = await prisma.systemConfig.findFirst();
  sendItem(res, config ?? {});
}

export async function upsertSystemConfig(req: Request, res: Response): Promise<void> {
  const existing = await prisma.systemConfig.findFirst();
  const config = existing
    ? await prisma.systemConfig.update({ where: { id: existing.id }, data: req.body as any })
    : await prisma.systemConfig.create({ data: req.body as any });

  await createActivityLog({
    action: existing ? "UPDATE" : "CREATE",
    entityType: "SystemConfig",
    entityId: config.id,
    entityLabel: config.agencyName ?? "System Config",
    performedBy: req.user?.id
  });

  sendItem(res, config);
}

export async function syncExchangeRates(req: Request, res: Response): Promise<void> {
  try {
    // 1. OBTENER CONFIGURACIÓN ACTUAL PRIMERO (Solo se declara UNA vez)
    const existing = await prisma.systemConfig.findFirst();
    
    // 🔥 EL ESCUDO
    if (existing && existing.exchangeRates) {
      const currentRates = JSON.parse(existing.exchangeRates);
      if (currentRates.length > 0 && currentRates[0].lastUpdated) {
        const lastSync = new Date(currentRates[0].lastUpdated);
        const hoursSinceLastSync = Math.abs(new Date().getTime() - lastSync.getTime()) / 36e5;

        if (hoursSinceLastSync < 4) {
          res.status(429).json({ 
            message: `Las tasas están actualizadas. Para cuidar tu cuota mensual, espera unas horas más. (Última vez: ${lastSync.toLocaleTimeString()})` 
          });
          return;
        }
      }
    }

    const apiKey = process.env.CURRENCY_API_KEY;
    if (!apiKey) {
      res.status(500).json({ message: "La API Key de CurrencyAPI no está configurada." });
      return;
    }

    // 2. LLAMADA A LA API
    const apiResponse = await axios.get("https://currencyapi.net/api/v2/rates", {
      params: { key: apiKey, base: "USD", output: "JSON" },
      timeout: 10000, 
      httpsAgent: new https.Agent({ family: 4 })
    });

    const data = apiResponse.data;

    if (!data || !data.rates) {
      res.status(500).json({ message: "La API de divisas respondió con un formato desconocido." });
      return;
    }

    const apiRates = data.rates;

    // 🔥 AQUÍ ESTABA EL ERROR: Hemos borrado el segundo 'const existing = ...' porque ya lo tenemos arriba.
    
    if (!existing || !existing.exchangeRates) {
      res.status(400).json({ message: "No hay tasas configuradas para actualizar." });
      return;
    }

    const currentRatesToUpdate = JSON.parse(existing.exchangeRates);

    // 3. Actualizar matemáticamente
    const updatedRates = currentRatesToUpdate.map((rate: any) => {
      const fromUsdValue = apiRates[rate.fromCurrency];
      const toUsdValue = apiRates[rate.toCurrency];

      if (fromUsdValue && toUsdValue) {
        const newRate = toUsdValue / fromUsdValue;
        return {
          ...rate,
          rate: newRate,
          lastUpdated: new Date().toISOString()
        };
      }
      return rate; 
    });

    // 4. Guardar en Base de Datos
    const payload = { exchangeRates: JSON.stringify(updatedRates) };
    const config = await prisma.systemConfig.update({
      where: { id: existing.id }, // 'existing.id' ya es reconocido por TypeScript
      data: payload
    });

    await createActivityLog({
      action: "SYNC_API",
      entityType: "SystemConfig",
      entityId: config.id,
      entityLabel: "Sincronización de divisas exitosa",
      performedBy: req.user?.id
    });

    sendItem(res, config);
  } catch (error: any) {
    console.error("Error crítico de Sincronización:", error?.response?.data || error.message);
    res.status(500).json({ 
      message: "Error de red al intentar sincronizar con el proveedor de divisas." 
    });
  }
}