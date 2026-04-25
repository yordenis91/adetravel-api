import { Router } from "express";
import { inviteUser, login, logout, getMe, updateMe, register } from "../controllers/auth.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { inviteSchema, loginSchema, registerSchema, updateMeSchema } from "../schemas/auth.schemas";
import { authMiddleware } from "../middlewares/auth.middleware";
import { roleMiddleware } from "../middlewares/role.middleware";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), asyncHandler(register));
authRouter.post("/login", validate(loginSchema), asyncHandler(login));
authRouter.post("/logout", authMiddleware, asyncHandler(logout));
authRouter.get("/me", authMiddleware, asyncHandler(getMe));
authRouter.patch("/me", authMiddleware, validate(updateMeSchema), asyncHandler(updateMe));
authRouter.post(
  "/invite",
  authMiddleware,
  roleMiddleware(["ADMINISTRADOR"]),
  validate(inviteSchema),
  asyncHandler(inviteUser)
);
