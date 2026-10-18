FROM node:22.15.0-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.28-alpine
RUN apk del nginx-module-acme nginx-module-geoip nginx-module-image-filter nginx-module-njs nginx-module-xslt && apk upgrade --no-cache && apk add --no-cache --upgrade nginx=1.28.3-r7
COPY deploy/nginx-main.conf /etc/nginx/nginx.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
