import rateLimit from "express-rate-limit";

// Rate limit para forgot-password: máximo 5 solicitudes por hora por IP
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // 5 solicitudes
  message: "Has intentado demasiadas veces. Por favor, intenta de nuevo en una hora.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // No aplicar rate limit si es un email corporativo conocido (opcional)
    const adminEmail = process.env.ADMIN_EMAIL;
    return req.body?.email === adminEmail;
  }
});

// Rate limit para reset-password: máximo 3 intentos por hora por IP
export const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 intentos
  message: "Has intentado demasiadas veces. Por favor, intenta de nuevo en una hora.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit para validate-reset-token: máximo 10 validaciones por hora por IP
export const validateTokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 validaciones
  message: "Demasiados intentos de validación. Por favor, intenta de nuevo más tarde.",
  standardHeaders: true,
  legacyHeaders: false,
});
