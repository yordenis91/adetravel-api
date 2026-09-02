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

# Arrancar las migraciones automáticas y encender el servidor Express
CMD ["npm", "run", "start"]