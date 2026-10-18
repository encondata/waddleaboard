# Waddle Aboard web: build the Vite app, then serve dist/ from nginx. Build context: repository root.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --workspace web --include-workspace-root=false
COPY web web
RUN npm run build --workspace web

FROM nginx:alpine
ENV WEB_MAX_BODY_SIZE=12m
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
