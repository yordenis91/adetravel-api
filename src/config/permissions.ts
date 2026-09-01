// 1. Definimos todas las acciones posibles en el sistema
export const PERMISSIONS = {
  // Usuarios
  MANAGE_USERS: "MANAGE_USERS",
  VIEW_USERS: "VIEW_USERS",
  
  // Configuraciones Globales
  MANAGE_SYSTEM_CONFIG: "MANAGE_SYSTEM_CONFIG",
  
  // Clientes
  CREATE_CLIENT: "CREATE_CLIENT",
  VIEW_CLIENTS: "VIEW_CLIENTS",
  DELETE_CLIENT: "DELETE_CLIENT",

  // Solicitudes (Requests)
  VIEW_REQUESTS: "VIEW_REQUESTS",
  MANAGE_REQUESTS: "MANAGE_REQUESTS",
  DELETE_REQUEST: "DELETE_REQUEST",

  // Servicios (por Solicitud)
  VIEW_SERVICES: "VIEW_SERVICES",
  MANAGE_SERVICES: "MANAGE_SERVICES",
  DELETE_SERVICE: "DELETE_SERVICE",

  // Cotizaciones
  VIEW_QUOTATIONS: "VIEW_QUOTATIONS",
  MANAGE_QUOTATIONS: "MANAGE_QUOTATIONS",
  DELETE_QUOTATION: "DELETE_QUOTATION",

  // Confirmaciones
  VIEW_CONFIRMATIONS: "VIEW_CONFIRMATIONS",
  MANAGE_CONFIRMATIONS: "MANAGE_CONFIRMATIONS",
  DELETE_CONFIRMATION: "DELETE_CONFIRMATION",

  // Pagos
  VIEW_PAYMENTS: "VIEW_PAYMENTS",
  MANAGE_PAYMENTS: "MANAGE_PAYMENTS",
  DELETE_PAYMENT: "DELETE_PAYMENT",

  // Proveedores (Vouchers)
  VIEW_PROVIDERS: "VIEW_PROVIDERS",
  MANAGE_PROVIDERS: "MANAGE_PROVIDERS",
  DELETE_PROVIDER: "DELETE_PROVIDER",

  // Vouchers
  VIEW_VOUCHERS: "VIEW_VOUCHERS",
  MANAGE_VOUCHERS: "MANAGE_VOUCHERS",
  DELETE_VOUCHER: "DELETE_VOUCHER",

  // Reportes
  VIEW_REPORTS: "VIEW_REPORTS",

  // Bitácora / Logs
  VIEW_LOGS: "VIEW_LOGS",
  PURGE_LOGS: "PURGE_LOGS", // Crítico, solo para Administradores de Sistema

  // Plantillas de Correo
  VIEW_TEMPLATES: "VIEW_TEMPLATES",
  MANAGE_TEMPLATES: "MANAGE_TEMPLATES",
  DELETE_TEMPLATE: "DELETE_TEMPLATE",

  // Envío de correos de cumpleaños
  SEND_BIRTHDAY_EMAILS: "SEND_BIRTHDAY_EMAILS",

  // Nomencladores (país, ciudad, región, nacionalidad, tipo/marca/modelo de auto)
  VIEW_CATALOGS: "VIEW_CATALOGS",
  MANAGE_CATALOGS: "MANAGE_CATALOGS",

  // Jobs automáticos (cron de notificaciones)
  RUN_JOBS: "RUN_JOBS",

  // Administración de roles y permisos
  MANAGE_PERMISSIONS: "MANAGE_PERMISSIONS",

} as const;

export type Permission = keyof typeof PERMISSIONS;

// 2. Asignamos los permisos a cada Rol de la Agencia
export const AGENCY_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  GERENTE: [
   PERMISSIONS.MANAGE_USERS, PERMISSIONS.VIEW_USERS, 
    PERMISSIONS.MANAGE_SYSTEM_CONFIG,
    PERMISSIONS.SEND_BIRTHDAY_EMAILS,
    PERMISSIONS.CREATE_CLIENT, PERMISSIONS.VIEW_CLIENTS, PERMISSIONS.DELETE_CLIENT,
    PERMISSIONS.VIEW_REQUESTS, PERMISSIONS.MANAGE_REQUESTS, PERMISSIONS.DELETE_REQUEST,
    PERMISSIONS.VIEW_SERVICES, PERMISSIONS.MANAGE_SERVICES, PERMISSIONS.DELETE_SERVICE,
    PERMISSIONS.VIEW_QUOTATIONS, PERMISSIONS.MANAGE_QUOTATIONS, PERMISSIONS.DELETE_QUOTATION,
    PERMISSIONS.VIEW_CONFIRMATIONS, PERMISSIONS.MANAGE_CONFIRMATIONS, PERMISSIONS.DELETE_CONFIRMATION,
    PERMISSIONS.VIEW_PAYMENTS, PERMISSIONS.MANAGE_PAYMENTS, PERMISSIONS.DELETE_PAYMENT,
    PERMISSIONS.VIEW_PROVIDERS, PERMISSIONS.MANAGE_PROVIDERS, PERMISSIONS.DELETE_PROVIDER,
    PERMISSIONS.VIEW_VOUCHERS, PERMISSIONS.MANAGE_VOUCHERS, PERMISSIONS.DELETE_VOUCHER,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_LOGS,
    PERMISSIONS.VIEW_TEMPLATES, PERMISSIONS.MANAGE_TEMPLATES, PERMISSIONS.DELETE_TEMPLATE,
    PERMISSIONS.VIEW_CATALOGS, PERMISSIONS.MANAGE_CATALOGS,
    PERMISSIONS.RUN_JOBS,
    PERMISSIONS.MANAGE_PERMISSIONS,
  ],
  FINANZAS: [
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_REQUESTS,
    PERMISSIONS.VIEW_SERVICES,
    PERMISSIONS.VIEW_QUOTATIONS,
    PERMISSIONS.VIEW_CONFIRMATIONS,
    PERMISSIONS.VIEW_PAYMENTS, PERMISSIONS.MANAGE_PAYMENTS,
    PERMISSIONS.VIEW_PROVIDERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_CATALOGS,
    PERMISSIONS.SEND_BIRTHDAY_EMAILS,
  ],
  OPERACIONES: [
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_REQUESTS,
    PERMISSIONS.VIEW_SERVICES, PERMISSIONS.MANAGE_SERVICES,
    PERMISSIONS.VIEW_QUOTATIONS,
    PERMISSIONS.VIEW_CONFIRMATIONS, PERMISSIONS.MANAGE_CONFIRMATIONS,
    PERMISSIONS.VIEW_PAYMENTS,
    PERMISSIONS.VIEW_PROVIDERS, PERMISSIONS.MANAGE_PROVIDERS,
    PERMISSIONS.VIEW_VOUCHERS, PERMISSIONS.MANAGE_VOUCHERS,
    PERMISSIONS.VIEW_CATALOGS,
    PERMISSIONS.SEND_BIRTHDAY_EMAILS,
  ],
  AGENTE_VENTAS: [
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.CREATE_CLIENT, PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_REQUESTS, PERMISSIONS.MANAGE_REQUESTS,
    PERMISSIONS.VIEW_SERVICES, PERMISSIONS.MANAGE_SERVICES,
    PERMISSIONS.VIEW_QUOTATIONS, PERMISSIONS.MANAGE_QUOTATIONS,
    PERMISSIONS.VIEW_CONFIRMATIONS, PERMISSIONS.MANAGE_CONFIRMATIONS,
    PERMISSIONS.VIEW_PAYMENTS, // Para ver si le pagaron su venta
    PERMISSIONS.VIEW_VOUCHERS, // Para descargar vouchers de sus clientes
    PERMISSIONS.VIEW_CATALOGS,
    PERMISSIONS.SEND_BIRTHDAY_EMAILS,
  ],
};

// 3. Función evaluadora ultra-rápida (matriz hardcodeada, sin BD)
export function hasPermission(systemRole: string, agencyRole: string | null | undefined, permission: Permission): boolean {
  // El Súper Administrador siempre tiene acceso a todo
  if (systemRole === "ADMINISTRADOR") return true;

  // Si es un usuario normal, buscamos los permisos de su rol de agencia
  const agencyPerms = agencyRole ? AGENCY_ROLE_PERMISSIONS[agencyRole] || [] : [];
  return agencyPerms.includes(permission);
}

// 4. Metadatos para la UI de administración (módulo + descripción legible)
export const PERMISSION_METADATA: Record<Permission, { module: string; description: string }> = {
  MANAGE_USERS: { module: "Usuarios", description: "Crear, editar y suspender usuarios" },
  VIEW_USERS: { module: "Usuarios", description: "Ver lista de usuarios" },
  MANAGE_SYSTEM_CONFIG: { module: "Configuración", description: "Editar configuración global de la agencia" },
  CREATE_CLIENT: { module: "Clientes", description: "Crear cliente" },
  VIEW_CLIENTS: { module: "Clientes", description: "Ver lista de clientes" },
  DELETE_CLIENT: { module: "Clientes", description: "Eliminar cliente" },
  VIEW_REQUESTS: { module: "Solicitudes", description: "Ver solicitudes" },
  MANAGE_REQUESTS: { module: "Solicitudes", description: "Crear y editar solicitudes" },
  DELETE_REQUEST: { module: "Solicitudes", description: "Eliminar solicitud" },
  VIEW_SERVICES: { module: "Servicios", description: "Ver servicios" },
  MANAGE_SERVICES: { module: "Servicios", description: "Crear y editar servicios" },
  DELETE_SERVICE: { module: "Servicios", description: "Eliminar servicio" },
  VIEW_QUOTATIONS: { module: "Cotizaciones", description: "Ver cotizaciones" },
  MANAGE_QUOTATIONS: { module: "Cotizaciones", description: "Crear, editar y enviar cotizaciones" },
  DELETE_QUOTATION: { module: "Cotizaciones", description: "Eliminar cotización" },
  VIEW_CONFIRMATIONS: { module: "Confirmaciones", description: "Ver confirmaciones" },
  MANAGE_CONFIRMATIONS: { module: "Confirmaciones", description: "Crear y confirmar con proveedor" },
  DELETE_CONFIRMATION: { module: "Confirmaciones", description: "Eliminar confirmación" },
  VIEW_PAYMENTS: { module: "Pagos", description: "Ver pagos" },
  MANAGE_PAYMENTS: { module: "Pagos", description: "Registrar y confirmar pagos" },
  DELETE_PAYMENT: { module: "Pagos", description: "Eliminar pago" },
  VIEW_PROVIDERS: { module: "Proveedores", description: "Ver proveedores" },
  MANAGE_PROVIDERS: { module: "Proveedores", description: "Crear y editar proveedores" },
  DELETE_PROVIDER: { module: "Proveedores", description: "Eliminar proveedor" },
  VIEW_VOUCHERS: { module: "Vouchers", description: "Ver y descargar vouchers" },
  MANAGE_VOUCHERS: { module: "Vouchers", description: "Crear y emitir vouchers" },
  DELETE_VOUCHER: { module: "Vouchers", description: "Eliminar voucher" },
  VIEW_REPORTS: { module: "Reportes", description: "Ver reportes y estadísticas" },
  VIEW_LOGS: { module: "Bitácora", description: "Ver registro de actividad" },
  PURGE_LOGS: { module: "Bitácora", description: "Purgar registros antiguos de la bitácora" },
  VIEW_TEMPLATES: { module: "Plantillas de Email", description: "Ver plantillas de correo" },
  MANAGE_TEMPLATES: { module: "Plantillas de Email", description: "Crear y editar plantillas de correo" },
  DELETE_TEMPLATE: { module: "Plantillas de Email", description: "Eliminar plantilla de correo" },
  SEND_BIRTHDAY_EMAILS: { module: "Clientes", description: "Enviar correos de cumpleaños" },
  VIEW_CATALOGS: { module: "Nomencladores", description: "Ver nomencladores (países, ciudades, etc.)" },
  MANAGE_CATALOGS: { module: "Nomencladores", description: "Editar nomencladores" },
  RUN_JOBS: { module: "Sistema", description: "Ejecutar tareas automáticas (cron)" },
  MANAGE_PERMISSIONS: { module: "Permisos", description: "Gestionar roles y permisos del sistema" },
};

export const AGENCY_ROLE_NAMES = Object.keys(AGENCY_ROLE_PERMISSIONS);

// 5. Override dinámico desde BD, con caché en memoria (TTL corto) para no
// pagar una consulta por cada permiso evaluado. Si un rol no tiene filas
// en RolePermission, se usa la matriz hardcodeada como fallback.
type RolePermissionCache = Record<string, Set<Permission>>;
let roleOverrideCache: RolePermissionCache | null = null;
let roleOverrideCacheAt = 0;
const ROLE_CACHE_TTL_MS = 15_000;

export function invalidateRolePermissionCache(): void {
  roleOverrideCache = null;
}

async function loadRoleOverrides(prisma: import("@prisma/client").PrismaClient): Promise<RolePermissionCache> {
  const rows = await prisma.rolePermission.findMany({ include: { role: true } });
  const map: RolePermissionCache = {};
  for (const row of rows) {
    if (!map[row.role.name]) map[row.role.name] = new Set();
    map[row.role.name].add(row.permission as Permission);
  }
  return map;
}

async function getRoleOverrides(prisma: import("@prisma/client").PrismaClient): Promise<RolePermissionCache> {
  const now = Date.now();
  if (!roleOverrideCache || now - roleOverrideCacheAt > ROLE_CACHE_TTL_MS) {
    roleOverrideCache = await loadRoleOverrides(prisma);
    roleOverrideCacheAt = now;
  }
  return roleOverrideCache;
}

/**
 * Permisos efectivos de un rol de agencia: usa el override guardado en BD
 * si existe (el admin lo personalizó desde la UI); si no, cae en la
 * matriz hardcodeada de este archivo.
 */
export async function getEffectiveRolePermissions(
  prisma: import("@prisma/client").PrismaClient,
  agencyRole: string
): Promise<Permission[]> {
  const overrides = await getRoleOverrides(prisma);
  const overridden = overrides[agencyRole];
  if (overridden) return Array.from(overridden);
  return AGENCY_ROLE_PERMISSIONS[agencyRole] ?? [];
}

/**
 * Permisos efectivos de un usuario: ADMINISTRADOR = todos; si no, permisos
 * de su rol de agencia (con override de BD si existe) + permisos directos
 * otorgados a ese usuario en particular (no vencidos).
 */
export async function getEffectivePermissions(
  prisma: import("@prisma/client").PrismaClient,
  userId: string,
  systemRole: string,
  agencyRole: string | null | undefined
): Promise<Permission[]> {
  if (systemRole === "ADMINISTRADOR") return Object.values(PERMISSIONS);

  const rolePerms = agencyRole ? await getEffectiveRolePermissions(prisma, agencyRole) : [];

  const directGrants = await prisma.userPermission.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  return Array.from(new Set([...rolePerms, ...directGrants.map(g => g.permission as Permission)]));
}

/**
 * Verificación async de un permiso puntual, respetando overrides de BD y
 * permisos directos de usuario. Usada por el middleware requirePermission.
 */
export async function hasPermissionAsync(
  prisma: import("@prisma/client").PrismaClient,
  userId: string,
  systemRole: string,
  agencyRole: string | null | undefined,
  permission: Permission
): Promise<boolean> {
  if (systemRole === "ADMINISTRADOR") return true;
  const perms = await getEffectivePermissions(prisma, userId, systemRole, agencyRole);
  return perms.includes(permission);
}