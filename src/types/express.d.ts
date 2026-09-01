import { UserRole, AgencyRole } from "@prisma/client";

declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      email: string;
      fullName: string;
      role: UserRole;
      agencyRole: AgencyRole | null;
      isActive: boolean;
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
