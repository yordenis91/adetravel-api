import { Router } from "express";
import { listTasks, createTask, updateTask, deleteTask } from "../controllers/tasks.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { taskSchema, updateTaskSchema } from "../validators/tasks.validator";
import { idSchema } from "../schemas/domain.schemas";

export const tasksRouter = Router();

// No requiere permiso específico, todos los usuarios logueados pueden tener tareas
tasksRouter.get("/", asyncHandler(listTasks));
tasksRouter.post("/", validate(taskSchema), asyncHandler(createTask));
tasksRouter.patch("/:id", validate(idSchema, "params"), validate(updateTaskSchema), asyncHandler(updateTask));
tasksRouter.delete("/:id", validate(idSchema, "params"), asyncHandler(deleteTask));