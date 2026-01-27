# Integration Tests Configuration

## Overview
Integration tests use a real PostgreSQL database to test functionality accurately. We use Docker Compose to manage the local database and a custom seeder script to initialize the schema and demo data.

## Setup

### 1. Start Database Container
We use the database service defined in `docker-compose.yml`.
```bash
docker compose up -d db
```

### 2. Initialize and Seed Database
The `seed:demo` script handles schema reset, table creation, and populating demo data (users, products, inventory, etc.).
```bash
# Set variables to point to the local Docker DB
export POSTGRES_URL=postgres://postgres:farmacia123@localhost:5432/farmacia_vallenar
npm run seed:demo
```

## Running Integration Tests

Integration tests require `POSTGRES_URL` to be defined to run. If not defined, they will be skipped.

```bash
# Run all integration tests (pointing to local Docker DB)
POSTGRES_URL=postgres://postgres:farmacia123@localhost:5432/farmacia_vallenar npm run test -- tests/integration

# Run a specific test
POSTGRES_URL=postgres://postgres:farmacia123@localhost:5432/farmacia_vallenar npm run test -- tests/integration/inventory-fix.test.ts
```

## Database Schema

The seeder script `src/scripts/seed-demo-vallenar.ts` contains the source of truth for the database schema used in integration tests. Every time you run `seed:demo`, the schema is reset and recreated.

## Best Practices

1. **Isolation:** Use transactions in tests to roll back changes (already implemented in `inventory-fix.test.ts`).
2. **Context:** Ensure the local database is running and `POSTGRES_URL` is correctly set.
3. **Data Consistency:** Run `npm run seed:demo` if you notice schema mismatches or if you need a fresh dataset.

## CI/CD Integration

The CI environment uses a PostgreSQL service to run these tests automatically.

- **POSTGRES_URL**: This is the primary environment variable used to connect to the database. In CI, it is automatically set in the workflow file to point to the temporary container.
- No additional GitHub Secrets are required for basic integration tests as the DB is ephemeral.

```yaml
# Partial snippet from .github/workflows/ci.yml
```

## Troubleshooting
- **"Terminal ya está abierto..."**: The seeder now uses `session_replication_role = 'replica'` to bypass triggers during cleanup.
- **SSL Errors**: The seeder is configured to disable SSL when connecting to `localhost`.
- **Relationship doesn't exist**: Ensure you've run `npm run seed:demo` at least once on your local DB.
