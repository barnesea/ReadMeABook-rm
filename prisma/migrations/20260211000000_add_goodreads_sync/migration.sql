-- CreateTable
CREATE TABLE "goodreads_shelves" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rss_url" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goodreads_shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goodreads_book_mappings" (
    "id" TEXT NOT NULL,
    "goodreads_book_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "audible_asin" TEXT,
    "cover_url" TEXT,
    "no_match" BOOLEAN NOT NULL DEFAULT false,
    "last_search_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goodreads_book_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goodreads_shelves_user_id_idx" ON "goodreads_shelves"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "goodreads_shelves_user_id_rss_url_key" ON "goodreads_shelves"("user_id", "rss_url");

-- CreateIndex
CREATE UNIQUE INDEX "goodreads_book_mappings_goodreads_book_id_key" ON "goodreads_book_mappings"("goodreads_book_id");

-- CreateIndex
CREATE INDEX "goodreads_book_mappings_goodreads_book_id_idx" ON "goodreads_book_mappings"("goodreads_book_id");

-- CreateIndex
CREATE INDEX "goodreads_book_mappings_audible_asin_idx" ON "goodreads_book_mappings"("audible_asin");

-- AddForeignKey
ALTER TABLE "goodreads_shelves" ADD CONSTRAINT "goodreads_shelves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
