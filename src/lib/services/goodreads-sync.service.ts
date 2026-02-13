/**
 * Component: Goodreads Shelf Sync Service
 * Documentation: documentation/backend/services/goodreads-sync.md
 *
 * Fetches Goodreads shelf RSS feeds, resolves books to Audible ASINs,
 * and creates requests via the shared request-creator service.
 */

import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { prisma } from '@/lib/db';
import { getAudibleService } from '@/lib/integrations/audible.service';
import { createRequestForUser } from '@/lib/services/request-creator.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('GoodreadsSync');

/** Default max Audible lookups per shelf per scheduled sync cycle */
const DEFAULT_MAX_LOOKUPS_PER_SHELF = 10;

/** Days before retrying a noMatch book */
const NO_MATCH_RETRY_DAYS = 7;

interface GoodreadsRssBook {
  bookId: string;
  title: string;
  author: string;
  coverUrl?: string;
}

/**
 * Parse a Goodreads RSS feed XML into structured book data.
 */
function parseGoodreadsRss(xml: string): { shelfName: string; books: GoodreadsRssBook[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
  });

  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel) {
    throw new Error('Invalid Goodreads RSS: no channel element');
  }

  const shelfName = typeof channel.title === 'string' ? channel.title : 'Goodreads Shelf';

  // Normalize items to array
  let items = channel.item;
  if (!items) return { shelfName, books: [] };
  if (!Array.isArray(items)) items = [items];

  const books: GoodreadsRssBook[] = [];
  for (const item of items) {
    const bookId = item.book_id?.toString();
    if (!bookId) continue;

    const title = (item.title || '').toString().trim();
    const authorName = (item.author_name || '').toString().trim();
    // Goodreads RSS has book_image_url or book_medium_image_url
    const coverUrl = (item.book_large_image_url || item.book_medium_image_url || item.book_image_url || '').toString().trim() || undefined;

    if (title && authorName) {
      books.push({ bookId, title, author: authorName, coverUrl });
    }
  }

  return { shelfName, books };
}

/**
 * Fetch and validate a Goodreads RSS URL.
 * Returns the parsed shelf name and books if valid.
 */
export async function fetchAndValidateRss(rssUrl: string): Promise<{ shelfName: string; books: GoodreadsRssBook[] }> {
  const response = await axios.get(rssUrl, { timeout: 15000 });
  return parseGoodreadsRss(response.data);
}

export interface GoodreadsSyncStats {
  shelvesProcessed: number;
  booksFound: number;
  lookupsPerformed: number;
  requestsCreated: number;
  errors: number;
}

export interface GoodreadsSyncOptions {
  /** Process only this shelf ID (for immediate single-shelf sync) */
  shelfId?: string;
  /** Max Audible lookups per shelf. 0 = unlimited. Default: 10 for scheduled, unlimited for immediate. */
  maxLookupsPerShelf?: number;
}

/**
 * Process Goodreads shelves: fetch RSS, resolve ASINs, create requests.
 * Called from the dedicated sync_goodreads_shelves processor.
 */
export async function processGoodreadsShelves(
  jobLogger?: ReturnType<typeof RMABLogger.forJob>,
  options: GoodreadsSyncOptions = {}
): Promise<GoodreadsSyncStats> {
  const log = jobLogger || logger;
  const stats: GoodreadsSyncStats = { shelvesProcessed: 0, booksFound: 0, lookupsPerformed: 0, requestsCreated: 0, errors: 0 };

  const maxLookups = options.maxLookupsPerShelf ?? DEFAULT_MAX_LOOKUPS_PER_SHELF;

  const whereClause = options.shelfId ? { id: options.shelfId } : {};
  const shelves = await prisma.goodreadsShelf.findMany({
    where: whereClause,
    include: { user: { select: { id: true, plexUsername: true } } },
  });

  if (shelves.length === 0) {
    log.info(options.shelfId ? 'Shelf not found' : 'No Goodreads shelves configured, skipping');
    return stats;
  }

  log.info(`Processing ${shelves.length} Goodreads shelf(s)${maxLookups > 0 ? ` (max ${maxLookups} lookups/shelf)` : ' (unlimited lookups)'}`);

  for (const shelf of shelves) {
    try {
      await processShelf(shelf, stats, log, maxLookups);
      stats.shelvesProcessed++;
    } catch (error) {
      stats.errors++;
      log.error(`Failed to process shelf "${shelf.name}" for user ${shelf.user.plexUsername}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  log.info(`Goodreads sync complete: ${stats.shelvesProcessed} shelves, ${stats.booksFound} books, ${stats.lookupsPerformed} lookups, ${stats.requestsCreated} requests created, ${stats.errors} errors`);
  return stats;
}

async function processShelf(
  shelf: { id: string; rssUrl: string; name: string; user: { id: string; plexUsername: string } },
  stats: GoodreadsSyncStats,
  log: ReturnType<typeof RMABLogger.forJob> | ReturnType<typeof RMABLogger.create>,
  maxLookups: number
) {
  log.info(`Fetching RSS for shelf "${shelf.name}" (user: ${shelf.user.plexUsername})`);

  let rssData: { shelfName: string; books: GoodreadsRssBook[] };
  try {
    rssData = await fetchAndValidateRss(shelf.rssUrl);
  } catch (error) {
    log.error(`Failed to fetch RSS for shelf "${shelf.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    return;
  }

  const books = rssData.books;
  stats.booksFound += books.length;
  log.info(`Found ${books.length} books in shelf "${shelf.name}"`);

  let lookupsThisCycle = 0;
  const unlimitedLookups = maxLookups === 0;

  for (const book of books) {
    // Look up existing mapping
    let mapping = await prisma.goodreadsBookMapping.findUnique({
      where: { goodreadsBookId: book.bookId },
    });

    if (!mapping) {
      // No mapping exists — perform Audible lookup if under cap
      if (!unlimitedLookups && lookupsThisCycle >= maxLookups) {
        continue; // Will be resolved in a future cycle
      }

      mapping = await performAudibleLookup(book, log);
      lookupsThisCycle++;
      stats.lookupsPerformed++;

      // If lookup found an ASIN, fall through to create request immediately
      if (!mapping?.audibleAsin) {
        continue;
      }
    }

    // Mapping exists with noMatch — check if we should retry
    if (mapping.noMatch) {
      if (mapping.lastSearchAt) {
        const daysSinceSearch = (Date.now() - mapping.lastSearchAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSearch >= NO_MATCH_RETRY_DAYS && (unlimitedLookups || lookupsThisCycle < maxLookups)) {
          log.info(`Retrying Audible lookup for "${book.title}" (${NO_MATCH_RETRY_DAYS}+ days since last search)`);
          mapping = await performAudibleLookup(book, log, mapping.id);
          lookupsThisCycle++;
          stats.lookupsPerformed++;

          // If retry found an ASIN, fall through to create request
          if (!mapping?.audibleAsin) {
            continue;
          }
        } else {
          continue; // Still no match, skip
        }
      } else {
        continue;
      }
    }

    // Mapping has ASIN — try to create request
    if (mapping.audibleAsin) {
      try {
        const result = await createRequestForUser(shelf.user.id, {
          asin: mapping.audibleAsin,
          title: mapping.title,
          author: mapping.author,
          coverArtUrl: mapping.coverUrl || undefined,
        });

        if (result.success) {
          stats.requestsCreated++;
          log.info(`Created request for "${mapping.title}" by ${mapping.author} (ASIN: ${mapping.audibleAsin})`);
        }
        // If not success, it's already available/requested/duplicate — silently skip
      } catch (error) {
        log.error(`Failed to create request for "${mapping.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  // Collect enriched book data (coverUrl + ASIN) for display
  const bookIds = books.map(b => b.bookId);
  const mappings = bookIds.length > 0
    ? await prisma.goodreadsBookMapping.findMany({
        where: { goodreadsBookId: { in: bookIds } },
        select: { goodreadsBookId: true, audibleAsin: true, title: true, author: true, coverUrl: true },
      })
    : [];
  const mappingsByBookId = new Map(mappings.map(m => [m.goodreadsBookId, m]));

  // Look up AudibleCache records for high-quality cached cover URLs
  const matchedAsins = mappings
    .map(m => m.audibleAsin)
    .filter((asin): asin is string => !!asin);
  const cachedCovers = matchedAsins.length > 0
    ? await prisma.audibleCache.findMany({
        where: { asin: { in: matchedAsins } },
        select: { asin: true, coverArtUrl: true, cachedCoverPath: true },
      })
    : [];
  const coverByAsin = new Map(
    cachedCovers
      .filter(c => c.cachedCoverPath || c.coverArtUrl)
      .map(c => {
        let coverUrl = c.coverArtUrl || '';
        if (c.cachedCoverPath) {
          const filename = c.cachedCoverPath.split('/').pop();
          coverUrl = `/api/cache/thumbnails/${filename}`;
        }
        return [c.asin, coverUrl] as const;
      })
  );

  const bookData = books
    .map(b => {
      const mapping = mappingsByBookId.get(b.bookId);
      // Prefer cached cover (local proxy) > mapping cover > Goodreads RSS cover
      const coverUrl = coverByAsin.get(mapping?.audibleAsin || '') || mapping?.coverUrl || b.coverUrl;
      if (!coverUrl) return null;
      return {
        coverUrl,
        asin: mapping?.audibleAsin || null,
        title: mapping?.title || b.title,
        author: mapping?.author || b.author,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .slice(0, 8);

  // Update shelf metadata
  await prisma.goodreadsShelf.update({
    where: { id: shelf.id },
    data: {
      lastSyncAt: new Date(),
      bookCount: books.length,
      coverUrls: bookData.length > 0 ? JSON.stringify(bookData) : null,
    },
  });
}

async function performAudibleLookup(
  book: GoodreadsRssBook,
  log: ReturnType<typeof RMABLogger.forJob> | ReturnType<typeof RMABLogger.create>,
  existingMappingId?: string
): Promise<any> {
  const audibleService = getAudibleService();

  try {
    // Try full Goodreads title first, then fall back to stripped title
    // (Goodreads titles often include series info like "(Demonica, #2)" that return 0 Audible results)
    const fullQuery = `${book.title} ${book.author}`;
    log.info(`Searching Audible for: "${fullQuery}"`);

    let searchResult = await audibleService.search(fullQuery);
    let firstResult = searchResult.results[0];

    if (!firstResult?.asin) {
      const cleanTitle = book.title.replace(/\s*\(.*\)\s*$/, '').trim();
      if (cleanTitle !== book.title) {
        const cleanQuery = `${cleanTitle} ${book.author}`;
        log.info(`No results with full title, retrying without series info: "${cleanQuery}"`);
        searchResult = await audibleService.search(cleanQuery);
        firstResult = searchResult.results[0];
      }
    }

    if (firstResult?.asin) {
      log.info(`Audible match: "${book.title}" → ASIN ${firstResult.asin} ("${firstResult.title}" by ${firstResult.author})`);

      // Use clean Audible/Audnexus metadata instead of Goodreads data
      // (Goodreads titles contain series info like "(The Empyrean, #1)" that pollute indexer searches)
      const data = {
        title: firstResult.title,
        author: firstResult.author,
        audibleAsin: firstResult.asin,
        coverUrl: firstResult.coverArtUrl || book.coverUrl || null,
        noMatch: false,
        lastSearchAt: new Date(),
      };

      if (existingMappingId) {
        return prisma.goodreadsBookMapping.update({ where: { id: existingMappingId }, data });
      }
      return prisma.goodreadsBookMapping.create({
        data: { goodreadsBookId: book.bookId, ...data },
      });
    }

    // No match found
    log.info(`No Audible match for "${book.title}" by ${book.author}`);

    const noMatchData = {
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl || null,
      noMatch: true,
      lastSearchAt: new Date(),
      audibleAsin: null,
    };

    if (existingMappingId) {
      return prisma.goodreadsBookMapping.update({ where: { id: existingMappingId }, data: noMatchData });
    }
    return prisma.goodreadsBookMapping.create({
      data: { goodreadsBookId: book.bookId, ...noMatchData },
    });
  } catch (error) {
    log.error(`Audible lookup failed for "${book.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);

    // Still create/update mapping so we don't retry every cycle
    const errorData = {
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl || null,
      noMatch: true,
      lastSearchAt: new Date(),
    };

    if (existingMappingId) {
      return prisma.goodreadsBookMapping.update({ where: { id: existingMappingId }, data: errorData });
    }
    return prisma.goodreadsBookMapping.create({
      data: { goodreadsBookId: book.bookId, ...errorData },
    });
  }
}
