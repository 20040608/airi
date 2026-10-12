# Мост Twitch -> Minecraft. В Railway: Root Directory = deploy/twitch-relay
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
CMD ["node", "index.js"]
