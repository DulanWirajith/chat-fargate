FROM node:16.20.2-alpine AS build
WORKDIR /srv
ADD package.json .
RUN npm install
ADD . .

FROM node:16.20.2-alpine
COPY --from=build /srv .
EXPOSE 3000
CMD ["node", "index.js"]
