# The web application.
#
# Packaged so a department installs Docker and nothing else — no Node, no npm,
# no toolchain on the server. Combined with the database and OCR containers,
# the whole system starts with a single `docker compose up -d`.
FROM node:22-slim

# Prisma needs OpenSSL at runtime to talk to Postgres.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a code change does not reinstall the world.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate the Prisma client and compile the application.
RUN npx prisma generate && npm run build

EXPOSE 3000

# Apply any pending migrations, then serve. `migrate deploy` is the
# non-interactive form — it never prompts and never resets data.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
