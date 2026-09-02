FROM node:22-alpine

RUN apk add --no-cache openssl

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

# 🚧 TEMPORAL: comando de arranque inofensivo para poder abrir una terminal
# en Easypanel y resolver manualmente la migración P3009 que quedó fallida.
# Mantiene el contenedor vivo y responde en el puerto para no fallar el
# health check, pero NO ejecuta `prisma migrate deploy`. Revertir a
# `CMD ["npm", "run", "start"]` en cuanto se resuelva la migración.
CMD ["node", "-e", "require('http').createServer((req,res)=>res.end('ok')).listen(process.env.PORT||3000)"]