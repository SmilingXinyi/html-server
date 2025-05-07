FROM oven/bun:latest AS builder

# 设置工作目录
WORKDIR /app

# 复制package.json和bun.lockb（如果存在）
COPY package.json bun.lock* ./

# 安装所有依赖(包括开发依赖)，用于构建
RUN bun install

# 复制源代码
COPY . .

# 构建项目
RUN bun run build

# 第二阶段：运行阶段
FROM oven/bun:latest AS runner

ARG PORT

WORKDIR /app

# 复制package.json和bun.lockb
COPY package.json bun.lock* ./

# 只安装生产依赖
RUN bun install --production

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./
COPY --from=builder /app/html ./html
COPY --from=builder /app/conf ./conf

# 设置环境变量
ENV PORT=${PORT:-3000}
ENV NODE_ENV=production

# 暴露端口
EXPOSE ${PORT:-3000}

# 运行服务
CMD ["bun", "run", "index.js"] 