#!/bin/bash
# Generate DB Schema Snapshot from Local Docker DB

# Directory for documentation
mkdir -p docs

# Generate schema only dump
echo "🚀 Generating Database Schema Snapshot..."
docker compose exec -t db pg_dump -U postgres -d farmacia_vallenar --schema-only > docs/DB_SCHEMA_SNAPSHOT.sql

if [ $? -eq 0 ]; then
    echo "✅ Schema snapshot saved to docs/DB_SCHEMA_SNAPSHOT.sql"
else
    echo "❌ Failed to generate schema snapshot. Ensure the 'db' container is running."
fi
