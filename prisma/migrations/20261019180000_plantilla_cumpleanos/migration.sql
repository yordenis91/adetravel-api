-- Plantilla "Felicitación de cumpleaños" por defecto, editable desde Configuración > Plantillas de correo.
-- Es el mismo diseño que usa el panel de cumpleaños; solo se crea si aún no existe una de ese tipo.
INSERT INTO "email_templates" ("id", "name", "type", "subject", "bodyHtml", "isActive", "description", "updatedAt")
SELECT gen_random_uuid()::text, 'Felicitación de cumpleaños', 'BIRTHDAY_GREETING', $t$¡Feliz cumpleaños, {{client_name}}! 🎂$t$,
$t$<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden;">
  <div style="background-color: #0f172a; padding: 30px 20px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-family: Georgia, serif;">¡Feliz Cumpleaños!</h1>
  </div>
  <div style="padding: 30px 20px; background-color: #ffffff; text-align: center;">
    <p style="font-size: 18px; color: #334155; margin-bottom: 20px;">Estimado/a <strong>{{client_full_name}}</strong>,</p>
    <div style="color: #64748b; line-height: 1.6; margin-bottom: 30px;">{{message}}</div>
    <div style="display: inline-block; padding: 12px 24px; background-color: #f8fafc; color: #0f172a; border-radius: 8px; font-weight: bold; border: 1px solid #e2e8f0;">🎉 ¡Disfruta tu día al máximo!</div>
  </div>
  <div style="background-color: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9;">{{agency_name}}</div>
</div>$t$,
true, 'Se usa al felicitar a los clientes desde el panel de cumpleaños. {{message}} es el saludo que el agente puede editar antes de enviar.', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "email_templates" WHERE "type" = 'BIRTHDAY_GREETING');
