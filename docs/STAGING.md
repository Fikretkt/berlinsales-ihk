# Staging runtime

ITMART is intended to run as a persistent Node.js application with PostgreSQL.
No serverless-specific runtime is required.

## Required environment

Copy .env.example and set production-safe values for:

- DATABASE_URL — PostgreSQL connection string
- AUTH_SECRET — long random secret
- AUTH_URL — public staging URL
- AUTH_TRUST_HOST=true
- EMAIL_FROM and, when e-mail delivery is needed, RESEND_API_KEY

Optional background jobs are enabled only with ENABLE_CRON=true. Run them as a
separate persistent process with pnpm jobs; do not run multiple scheduler
instances against the same database.

## Deploy sequence

1. Install dependencies with pnpm install --frozen-lockfile.
2. Set the staging environment variables.
3. Apply database migrations with pnpm db:migrate.
4. Build the application with pnpm build.
5. Start the persistent web process with pnpm start.
6. Check liveness at GET /api/health.

The web process requires no database access merely for the health response.
The application itself requires PostgreSQL for authenticated business requests.

## CI

CI keeps the production build command. Its syntactically valid DATABASE_URL
is only configuration for build-time module loading; builds must not be pointed
at a production or staging database.
