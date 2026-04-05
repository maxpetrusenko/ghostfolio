#!/bin/sh

set -ex

echo "Running database migrations"
npx prisma migrate deploy

if [ "${SKIP_DB_SEED:-false}" = "true" ]; then
  echo "Skipping database seed"
else
  echo "Seeding the database"
  npx prisma db seed
fi

echo "Starting the server"
exec node main
