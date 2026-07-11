FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "dist/index.js"]
