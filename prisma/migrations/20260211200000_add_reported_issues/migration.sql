-- CreateTable
CREATE TABLE "reported_issues" (
    "id" TEXT NOT NULL,
    "audiobook_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reason" VARCHAR(250) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reported_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reported_issues_audiobook_id_idx" ON "reported_issues"("audiobook_id");

-- CreateIndex
CREATE INDEX "reported_issues_reporter_id_idx" ON "reported_issues"("reporter_id");

-- CreateIndex
CREATE INDEX "reported_issues_status_idx" ON "reported_issues"("status");

-- AddForeignKey
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_audiobook_id_fkey" FOREIGN KEY ("audiobook_id") REFERENCES "audiobooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reported_issues" ADD CONSTRAINT "reported_issues_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
