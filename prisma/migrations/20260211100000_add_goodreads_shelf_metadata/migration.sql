-- Add cached book count and cover URLs to goodreads_shelves for rich UI display
ALTER TABLE "goodreads_shelves" ADD COLUMN "book_count" INTEGER;
ALTER TABLE "goodreads_shelves" ADD COLUMN "cover_urls" TEXT;
