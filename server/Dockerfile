FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY rules ./rules
COPY migrations ./migrations
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
