# Integration Tests Configuration

## Overview
Integration tests use a real PostgreSQL database to test functionality accurately without complex mocks.

## Setup

### 1. Create Test Database
```bash
# Using psql
createdb pharma_synapse_test

# Or using Docker
docker run --name pharma-test-db \
  -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=pharma_synapse_test \
  -p 5433:5432 \
  -d postgres:16
```

### 2. Run Migrations on Test DB
```bash
# Set test database URL
export TEST_DATABASE_URL="postgresql://user:pass@localhost:5433/pharma_synapse_test"

# Run migrations
psql $TEST_DATABASE_URL < db/migrations/*.sql
```

### 3. Configure Environment
```bash
# .env.test
TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/pharma_synapse_test
```

## Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific integration test
npm test -- tests/integration/users-v2.integration.test.ts

# Run with coverage
npm run test:integration -- --coverage
```

## Test Database Management

### Clean Test Data
```sql
-- Automatically handled by beforeEach/afterAll hooks
DELETE FROM users WHERE id LIKE 'test-%';
DELETE FROM audit_log WHERE user_id LIKE 'test-%';
```

### Reset Test Database
```bash
# Drop and recreate
dropdb pharma_synapse_test
createdb pharma_synapse_test
psql $TEST_DATABASE_URL < db/migrations/*.sql
```

## Best Practices

1. **Isolation:** Each test cleans up after itself
2. **Idempotency:** Tests can run multiple times
3. **Test Data:** Use `test-` prefix for all test IDs
4. **Transactions:** Tests use real transactions to verify behavior
5. **Cleanup:** beforeEach/afterAll ensures clean state

## Advantages over Unit Tests with Mocks

✅ Tests actual database behavior  
✅ No complex mock setup  
✅ Catches real SQL errors  
✅ Verifies transactions work correctly  
✅ Tests constraints and triggers  
✅ More confidence in production behavior  

## Disadvantages

⚠️ Slower than unit tests (but still fast ~200ms total)  
⚠️ Requires database setup  
⚠️ Needs isolated test database  

## CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Setup PostgreSQL
  uses: Harmon758/postgresql-action@v1
  with:
    postgresql version: '16'
    postgresql db: 'pharma_synapse_test'
    
- name: Run Migrations
  run: psql $TEST_DATABASE_URL < db/migrations/*.sql
  
- name: Run Integration Tests
  run: npm run test:integration
```
