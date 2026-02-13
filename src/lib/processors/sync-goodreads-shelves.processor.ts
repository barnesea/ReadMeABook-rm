/**
 * Component: Sync Goodreads Shelves Processor
 * Documentation: documentation/backend/services/scheduler.md
 *
 * Dedicated processor for syncing Goodreads shelf RSS feeds.
 * Resolves books to Audible ASINs and creates requests.
 */

import { RMABLogger } from '../utils/logger';

export interface SyncGoodreadsShelvesPayload {
  jobId?: string;
  scheduledJobId?: string;
  /** If set, only process this specific shelf (used for immediate sync on add) */
  shelfId?: string;
  /** Max Audible lookups per shelf. 0 = unlimited. */
  maxLookupsPerShelf?: number;
}

export async function processSyncGoodreadsShelves(payload: SyncGoodreadsShelvesPayload): Promise<any> {
  const { jobId, shelfId, maxLookupsPerShelf } = payload;
  const logger = RMABLogger.forJob(jobId, 'SyncGoodreadsShelves');

  logger.info(shelfId
    ? `Starting immediate Goodreads sync for shelf ${shelfId}...`
    : 'Starting scheduled Goodreads shelves sync...'
  );

  const { processGoodreadsShelves } = await import('../services/goodreads-sync.service');
  const stats = await processGoodreadsShelves(logger, {
    shelfId,
    maxLookupsPerShelf: maxLookupsPerShelf ?? (shelfId ? 0 : undefined),
  });

  logger.info('Goodreads sync complete', { stats });

  return {
    success: true,
    message: shelfId ? 'Goodreads shelf synced' : 'Goodreads shelves synced',
    ...stats,
  };
}
