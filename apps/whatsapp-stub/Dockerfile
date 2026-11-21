FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 4100
CMD ["npx", "tsx", "src/server.ts"]
