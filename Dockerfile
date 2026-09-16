FROM node:22-alpine

# tini como PID 1: reenvía correctamente SIGTERM al proceso real (npm no lo
# hace de forma confiable a sus hijos) y cosecha procesos zombis. Sin esto,
# un redeploy en Easypanel puede tardar en propagar la señal de apagado, y
# Docker termina mandando SIGKILL de golpe — si eso ocurre a mitad de
# `prisma migrate deploy`, la migración queda marcada como fallida (P3009)
# y el contenedor entra en bucle de reinicio en el siguiente arranque.
#
# postgresql16-client: da el binario `pg_dump` que usa el cron de backup
# (ver src/jobs/backupDatabase.job.ts). La versión 16 tiene que matchear la
# versión mayor del Postgres real de producción/CI — si en algún momento se
# sube de versión el servidor, actualizar también este paquete.
RUN apk add --no-cache openssl tini postgresql16-client

WORKDIR /app

# Copiar archivos de configuración de dependencias y base de datos
COPY package*.json ./
COPY prisma ./prisma/

# Instalamos las dependencias necesarias para compilar TypeScript
RUN npm ci

# Generar el cliente de Prisma para interactuar con PostgreSQL
RUN npx prisma generate

# 🔥 LA CORRECCIÓN: Copiar todo el código fuente en una sola línea válida
COPY . .

# Compilar el proyecto TypeScript (esto creará la carpeta /app/dist/)
RUN npm run build

EXPOSE 3000

# --start-period generoso porque el arranque real corre `prisma migrate
# deploy` antes de escuchar en el puerto; si hay migraciones pendientes
# puede tardar más que un arranque en frío normal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]

# Arrancar las migraciones automáticas y encender el servidor Express
CMD ["npm", "run", "start"]