FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .

# NEXT_PUBLIC_* values are inlined into the bundle at build time, so the GA
# measurement id must be present here — setting it on the running container has
# no effect. Empty by default: the build then ships no gtag.js.
ARG NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=""
ENV NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=$NEXT_PUBLIC_GOOGLE_ANALYTICS_ID

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
