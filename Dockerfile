FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Copiar package y lock para aprovechar cache
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --production=false

# Generar Prisma client
RUN npx prisma generate

# Compilar TypeScript
COPY . .
RUN npm run build

EXPOSE 3000

# Ejecutar la app compilada
CMD ["npm", "run", "start"]
