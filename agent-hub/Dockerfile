# ===== 阶段 1：安装依赖 =====
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ===== 阶段 2：构建 =====
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ===== 阶段 3：生产运行 =====
# 学习项目简化：直接复用完整 node_modules（含 prisma CLI），便于启动时执行 migrate deploy
# 生产可优化：npm ci --omit=dev + 独立迁移服务，缩小镜像体积
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
# 从 build COPY（含 prisma generate 产出的 .prisma/client），而不是 deps
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
