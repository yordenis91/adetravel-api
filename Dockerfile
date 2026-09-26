FROM node:22-alpine

# tini como PID 1: reenvía correctamente SIGTERM al proceso real (npm no lo
# hace de forma confiable a sus hijos) y cosecha procesos zombis. Sin esto,
# un redeploy en Easypanel puede tardar en propagar la señal de apagado, y
# Docker termina mandando SIGKILL de golpe — si eso ocurre a mitad de
# `prisma migrate deploy`, la migración queda marcada como fallida (P3009)
# y el contenedor entra en bucle de reinicio en el siguiente arranque.
#
# postgresql17-client: da el binario `pg_dump` que usa el cron de backup
# (ver src/jobs/backupDatabase.job.ts). pg_dump se niega a volcar un servidor
# con una versión mayor a la suya — producción quedó con todos los backups
# fallando en silencio ("aborting because of server version mismatch:
# server version 17.11; pg_dump version 16.15") porque el servidor real se
# subió a Postgres 17 y este paquete se quedó en 16. Este paquete tiene que
# quedar siempre en la misma versión mayor que el Postgres real de
# producción/CI — si en algún momento se sube de versión el servidor,
# actualizar también este paquete.
RUN apk add --no-cache openssl tini postgresql17-client

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
#
# La verificación se hace con Node (el runtime que ya sabemos que está en la
# imagen) en vez de `wget`. Producción mostraba el contenedor reiniciándose
# cada ~100s en un patrón fijo — matemáticamente igual a start-period(45s) +
# 3 x interval(30s) = el punto exacto en que Docker marca "unhealthy" tras 3
# fallos seguidos. Todo indica que el propio `wget --spider` fallaba siempre
# en esta imagen (sin relación con el estado real de la app), y Easypanel
# reiniciaba el contenedor por eso, no por ningún problema del backend.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]

# Arrancar las migraciones automáticas y encender el servidor Express
CMD ["npm", "run", "start"]