FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY ticket-server.js .
COPY index.html .
COPY list-printer.html .
COPY watch-printer.html .
EXPOSE 3000
CMD ["node", "ticket-server.js"]
