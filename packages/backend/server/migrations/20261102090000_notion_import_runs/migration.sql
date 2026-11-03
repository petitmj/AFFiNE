-- Additive only: new tables and enums, no change to existing rows, so an
-- older server can share the database while this one rolls out.

-- CreateEnum
CREATE TYPE "NotionImportRunStatus" AS ENUM ('pending', 'running', 'paused', 'staged', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "NotionImportTaskKind" AS ENUM ('search', 'users', 'page', 'database', 'database_rows', 'block_children', 'property_page', 'comments', 'download_file');

-- CreateEnum
CREATE TYPE "NotionImportTaskStatus" AS ENUM ('pending', 'leased', 'done', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "NotionImportItemKind" AS ENUM ('page', 'database', 'data_source', 'block', 'property', 'comment', 'user');

-- CreateEnum
CREATE TYPE "NotionImportFileStatus" AS ENUM ('pending', 'stored', 'unavailable');

-- CreateEnum
CREATE TYPE "NotionImportOutcome" AS ENUM ('mapped', 'degraded', 'preserved_only', 'unrecoverable');

-- CreateTable
CREATE TABLE "notion_import_runs" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "created_by" VARCHAR,
    "status" "NotionImportRunStatus" NOT NULL DEFAULT 'pending',
    "api_version" VARCHAR NOT NULL,
    "scope" JSONB NOT NULL,
    "token_cipher" TEXT,
    "notion_workspace_name" VARCHAR,
    "lease_owner" VARCHAR,
    "lease_expires_at" TIMESTAMPTZ(3),
    "progress" JSONB NOT NULL DEFAULT '{}',
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notion_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_import_tasks" (
    "id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "kind" "NotionImportTaskKind" NOT NULL,
    "target_id" VARCHAR NOT NULL,
    "cursor" VARCHAR,
    "status" "NotionImportTaskStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "not_before" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notion_import_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_import_items" (
    "run_id" VARCHAR NOT NULL,
    "kind" "NotionImportItemKind" NOT NULL,
    "notion_id" VARCHAR NOT NULL,
    "parent_id" VARCHAR,
    "position" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "payload_hash" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notion_import_items_pkey" PRIMARY KEY ("run_id","kind","notion_id")
);

-- CreateTable
CREATE TABLE "notion_import_files" (
    "run_id" VARCHAR NOT NULL,
    "owner_id" VARCHAR NOT NULL,
    "slot" VARCHAR NOT NULL,
    "blob_key" VARCHAR,
    "size" INTEGER,
    "mime" VARCHAR,
    "status" "NotionImportFileStatus" NOT NULL DEFAULT 'pending',
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notion_import_files_pkey" PRIMARY KEY ("run_id","owner_id","slot")
);

-- CreateTable
CREATE TABLE "notion_import_ledger" (
    "run_id" VARCHAR NOT NULL,
    "notion_id" VARCHAR NOT NULL,
    "subject" VARCHAR NOT NULL,
    "outcome" "NotionImportOutcome" NOT NULL,
    "codes" TEXT[],
    "affine_doc_id" VARCHAR,
    "content_hash" VARCHAR,
    "reported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notion_import_ledger_pkey" PRIMARY KEY ("run_id","notion_id","subject")
);

-- CreateIndex
CREATE INDEX "notion_import_runs_status_lease_expires_at_idx" ON "notion_import_runs"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "notion_import_runs_workspace_id_created_at_idx" ON "notion_import_runs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "notion_import_runs_expires_at_idx" ON "notion_import_runs"("expires_at");

-- CreateIndex
CREATE INDEX "notion_import_tasks_run_id_status_not_before_idx" ON "notion_import_tasks"("run_id", "status", "not_before");

-- CreateIndex
CREATE UNIQUE INDEX "notion_import_tasks_run_id_kind_target_id_key" ON "notion_import_tasks"("run_id", "kind", "target_id");

-- CreateIndex
CREATE INDEX "notion_import_items_run_id_kind_position_idx" ON "notion_import_items"("run_id", "kind", "position");

-- CreateIndex
CREATE INDEX "notion_import_items_run_id_parent_id_position_idx" ON "notion_import_items"("run_id", "parent_id", "position");

-- CreateIndex
CREATE INDEX "notion_import_files_run_id_status_idx" ON "notion_import_files"("run_id", "status");

-- CreateIndex
CREATE INDEX "notion_import_ledger_run_id_outcome_idx" ON "notion_import_ledger"("run_id", "outcome");

-- AddForeignKey
ALTER TABLE "notion_import_runs" ADD CONSTRAINT "notion_import_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_import_runs" ADD CONSTRAINT "notion_import_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_import_tasks" ADD CONSTRAINT "notion_import_tasks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_import_items" ADD CONSTRAINT "notion_import_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_import_files" ADD CONSTRAINT "notion_import_files_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notion_import_ledger" ADD CONSTRAINT "notion_import_ledger_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "notion_preserved_records" (
    "workspace_id" VARCHAR NOT NULL,
    "kind" VARCHAR NOT NULL,
    "notion_id" VARCHAR NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" VARCHAR NOT NULL,
    "source_run_id" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notion_preserved_records_pkey" PRIMARY KEY ("workspace_id","kind","notion_id")
);

-- AddForeignKey
ALTER TABLE "notion_preserved_records" ADD CONSTRAINT "notion_preserved_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
