# Starting point for containerized deploys. Build context = monorepo ROOT:
#   docker build -f apps/mcp-server/Dockerfile -t ftu-mcp-server .
#
# It builds the @freetouse/api workspace and this server. The image is not
# size-optimized (keeps the full workspace install); prune for production if
# image size matters.
FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w @freetouse/api -w ftu-mcp-server

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app /app
EXPOSE 3000
# PUBLIC_URL must be set at run time to the public HTTPS URL, e.g.
#   docker run -p 3000:3000 -e PUBLIC_URL="https://music-mcp.example.com" ftu-mcp-server
CMD ["node", "apps/mcp-server/dist/server.js"]
