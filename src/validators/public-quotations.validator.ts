import { z } from "zod";

/** Lo que escribe el cliente en la página pública: texto plano corto, sin HTML (se escapa al mostrarlo). */
const text = (max: number) => z.string().trim().max(max).transform((v) => [...v].filter((c) => { const n = c.charCodeAt(0); return n >= 32 || n === 9 || n === 10 || n === 13; }).join(""));

export const publicMessageSchema = z.object({
  message: text(1000).optional(),
  contactName: text(100).optional(),
});

/** Para consultas el mensaje es obligatorio. */
export const publicQuestionSchema = publicMessageSchema.refine((v) => !!v.message, { message: "Escribe tu consulta", path: ["message"] });

export type PublicMessageInput = z.infer<typeof publicMessageSchema>;
