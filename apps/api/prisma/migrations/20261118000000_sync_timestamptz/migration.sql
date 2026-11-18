-- AlterTable: instantes (timestamptz) para o LWW comparar momentos, não strings.
ALTER TABLE "sync_records"
  ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ(3) USING "deleted_at" AT TIME ZONE 'UTC';
