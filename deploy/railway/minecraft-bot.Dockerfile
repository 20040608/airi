# Minecraft-бот AIRI для Railway
# Контекст сборки: корень репозитория (ваш форк airi). В Railway: RAILWAY_DOCKERFILE_PATH=deploy/railway/minecraft-bot.Dockerfile
FROM node:26-bookworm

# Системные библиотеки для нативных модулей canvas и isolated-vm
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     build-essential python3 pkg-config \
     libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

# Версия pnpm из package.json репозитория
RUN npm install -g pnpm@11.24.0

WORKDIR /app
COPY . .

# Ставим только Minecraft-бота и его зависимости (+ корень ради tsdown), а не весь монорепозиторий.
# --ignore-scripts отключает общий postinstall, который собирает ВСЕ пакеты репозитория.
RUN pnpm install --filter "@proj-airi/root" --filter "@proj-airi/minecraft-bot..." --frozen-lockfile --ignore-scripts

# Собираем нативные модули (canvas, isolated-vm) только для бота
RUN pnpm rebuild --filter "@proj-airi/minecraft-bot..."

# Собираем пакеты репозитория, от которых зависит бот (server-sdk, server-shared и т.д.)
RUN pnpm --filter "@proj-airi/minecraft-bot^..." run build

WORKDIR /app/integrations/minecraft

# В репозитории лежит .env с пустыми значениями. Заменяем его пустым файлом,
# чтобы все настройки брались из Variables в Railway.
RUN rm -f .env.local && : > .env

ENV NODE_ENV=production
CMD ["pnpm", "start"]
