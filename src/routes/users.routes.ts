import { Router } from "express";
import { deleteUser, getUser, listUsers, updateUser } from "../controllers/users.controller";
import { validate } from "../middlewares/validation.middleware";
import { userIdParamSchema, usersListQuerySchema, updateUserSchema } from "../schemas/users.schemas";
import { asyncHandler } from "../utils/async-handler";
import { roleMiddleware } from "../middlewares/role.middleware";

export const usersRouter = Router();

usersRouter.use(roleMiddleware(["ADMINISTRADOR"]));
usersRouter.get("/", validate(usersListQuerySchema, "query"), asyncHandler(listUsers));
usersRouter.get("/:id", validate(userIdParamSchema, "params"), asyncHandler(getUser));
usersRouter.patch(
  "/:id",
  validate(userIdParamSchema, "params"),
  validate(updateUserSchema),
  asyncHandler(updateUser)
);
usersRouter.delete("/:id", validate(userIdParamSchema, "params"), asyncHandler(deleteUser));
