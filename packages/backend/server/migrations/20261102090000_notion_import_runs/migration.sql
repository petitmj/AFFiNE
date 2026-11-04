-- Notion zero-loss import: durable run, task, staging, file, ledger and
-- preserved-record storage. Additive only; no existing row is changed.

-- CreateEnum
CREATE TYPE "NotionImportRunStatus" AS ENUM ('Pending', 'Running', 'Paused', 'Staged', 'Failed', 'Cancelled', 'Expired');

-- CreateEnum
CREATE TYPE "NotionImportTaskKind" AS ENUM ('Users', 'Search', 'Page', 'Database', 'DatabaseRows', 'BlockChildren', 'PropertyPage', 'Comments', 'DownloadFile');

-- CreateEnum
CREATE TYPE "NotionImportTaskStatus" AS ENUM ('Pending', 'Leased', 'Done', 'Failed');

-- CreateEnum
CREATE TYPE "NotionImportItemKind" AS ENUM ('User', 'Page', 'Database', 'DataSource', 'Block', 'Property', 'Comment');

-- CreateEnum
CREATE TYPE "NotionImportFileStatus" AS ENUM ('Pending', 'Stored', 'Unavailable');

-- CreateEnum
CREATE TYPE "NotionImportOutcome" AS ENUM ('Mapped', 'Degraded', 'PreservedOnly', 'Unrecoverable');

-- CreateTable
CREATE TABLE "notion_import_runs" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "created_by" VARCHAR,
    "status" "NotionImportRunStatus" NOT NULL DEFAULT 'Pending',
    "token_cipher" TEXT,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "include_block_comments" BOOLEAN NOT NULL DEFAULT false,
    "last_error" TEXT,
    "lease_owner" VARCHAR,
    "lease_expires_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notion_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_import_tasks" (
    "id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "kind" "NotionImportTaskKind" NOT NULL,
    "target_id" VARCHAR NOT NULL,
    "status" "NotionImportTaskStatus" NOT NULL DEFAULT 'Pending',
    "cursor" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "lease_owner" VARCHAR,
    "lease_expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notion_import_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_import_items" (
    "id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "kind" "NotionImportItemKind" NOT NULL,
    "notion_id" VARCHAR NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" VARCHAR NOT NULL,
    "parent_id" VARCHAR,
    "position" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notion_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_import_files" (
    "id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "owner_id" VARCHAR NOT NULL,
    "slot" VARCHAR NOT NULL,
    "blob_key" VARCHAR,
    "status" "NotionImportFileStatus" NOT NULL DEFAULT 'Pending',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notion_import_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_import_ledger" (
    "id" VARCHAR NOT NULL,
    "run_id" VARCHAR NOT NULL,
    "notion_id" VARCHAR NOT NULL,
    "subject" VARCHAR NOT NULL,
    "outcome" "NotionImportOutcome" NOT NULL,
    "warning_code" VARCHAR,
    "content_hash" VARCHAR,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notion_import_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notion_preserved_records" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "kind" VARCHAR NOT NULL,
    "notion_id" VARCHAR NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notion_preserved_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notion_import_tasks_run_id_kind_target_id_key" ON "notion_import_tasks"("run_id", "kind", "target_id");
CREATE INDEX "notion_import_tasks_claim_idx" ON "notion_import_tasks"("run_id", "status", "next_attempt_at");
CREATE INDEX "notion_import_tasks_lease_idx" ON "notion_import_tasks"("lease_owner", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "notion_import_items_run_id_kind_notion_id_key" ON "notion_import_items"("run_id", "kind", "notion_id");
CREATE INDEX "notion_import_items_scan_idx" ON "notion_import_items"("run_id", "kind", "notion_id");

-- CreateIndex
CREATE UNIQUE INDEX "notion_import_files_run_id_owner_id_slot_key" ON "notion_import_files"("run_id", "owner_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "notion_import_ledger_run_id_notion_id_subject_key" ON "notion_import_ledger"("run_id", "notion_id", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "notion_preserved_records_workspace_id_kind_notion_id_key" ON "notion_preserved_records"("workspace_id", "kind", "notion_id");

CREATE INDEX "notion_import_runs_workspace_status_idx" ON "notion_import_runs"("workspace_id", "status");
CREATE INDEX "notion_import_runs_lease_idx" ON "notion_import_runs"("status", "lease_expires_at");

-- AddForeignKey
ALTER TABLE "notion_import_runs" ADD CONSTRAINT "notion_import_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notion_import_runs" ADD CONSTRAINT "notion_import_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notion_import_tasks" ADD CONSTRAINT "notion_import_tasks_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notion_import_items" ADD CONSTRAINT "notion_import_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notion_import_files" ADD CONSTRAINT "notion_import_files_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notion_import_ledger" ADD CONSTRAINT "notion_import_ledger_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "notion_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notion_preserved_records" ADD CONSTRAINT "notion_preserved_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
