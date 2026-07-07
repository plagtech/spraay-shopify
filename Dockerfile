FROM node:20-alpine

RUN apk add --no-cache openssl
WORKDIR /app

# Install ALL dependencies (do NOT use --omit=dev): the production build needs
# vite, and the runtime `prisma migrate deploy` (via docker-start) needs the
# prisma CLI — both are devDependencies in this project.
COPY package.json package-lock.json* ./
RUN npm ci --include=dev && npm cache clean --force

COPY . .

# Generate the Prisma client and build the Remix app.
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# docker-start runs: prisma generate && prisma migrate deploy, then remix-serve.
# remix-serve listens on $PORT, which Railway injects automatically.
CMD ["npm", "run", "docker-start"]
