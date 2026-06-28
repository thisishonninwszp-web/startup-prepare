# 用 Playwright 官方镜像：已内置 Chromium 及系统依赖，省去 `playwright install` 的环境坑。
# 版本号要和 package.json 里的 playwright 大致对齐（这里 1.61）。
FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

# 先只拷依赖清单，利用 Docker 层缓存（依赖没变就不重装）。
COPY package*.json ./
RUN npm ci --include=optional

# 再拷源码。
COPY . .

# 服务端口（Railway 会注入 PORT 环境变量，server.ts 读它）。
EXPOSE 8080

# 常驻 HTTP 服务 + 内置定时器。
CMD ["npm", "run", "serve"]
