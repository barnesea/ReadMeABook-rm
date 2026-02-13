/**
 * Component: Audible Refresh Processor Tests
 * Documentation: documentation/backend/services/scheduler.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../helpers/prisma';

const prismaMock = createPrismaMock();
const audibleServiceMock = vi.hoisted(() => ({
  getPopularAudiobooks: vi.fn(),
  getNewReleases: vi.fn(),
}));
const thumbnailCacheMock = vi.hoisted(() => ({
  cacheThumbnail: vi.fn(),
  cleanupUnusedThumbnails: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/integrations/audible.service', () => ({
  getAudibleService: () => audibleServiceMock,
}));

vi.mock('@/lib/services/thumbnail-cache.service', () => ({
  getThumbnailCacheService: () => thumbnailCacheMock,
}));

describe('processAudibleRefresh', () => {
  let origSetTimeout: typeof global.setTimeout;

  beforeEach(() => {
    vi.clearAllMocks();
    origSetTimeout = global.setTimeout;
    // Replace setTimeout so the batch cooldown resolves instantly
    global.setTimeout = ((fn: (...args: any[]) => void) => {
      fn();
      return 0 as ReturnType<typeof setTimeout>;
    }) as any;
  });

  afterEach(() => {
    global.setTimeout = origSetTimeout;
  });

  it('refreshes popular and new releases, caching thumbnails', async () => {
    const popular = [
      {
        asin: 'ASIN-1',
        title: 'Popular One',
        author: 'Author A',
        narrator: 'Narrator A',
        description: 'Desc',
        coverArtUrl: 'http://image/1',
        durationMinutes: 120,
        releaseDate: '2024-01-01',
        rating: 4.8,
        genres: ['fiction'],
      },
      {
        asin: 'ASIN-2',
        title: 'Popular Two',
        author: 'Author B',
        narrator: 'Narrator B',
        description: 'Desc',
        coverArtUrl: null,
        durationMinutes: 90,
        releaseDate: null,
        rating: null,
        genres: [],
      },
    ];
    const newReleases = [
      {
        asin: 'ASIN-3',
        title: 'New Release',
        author: 'Author C',
        narrator: 'Narrator C',
        description: 'Desc',
        coverArtUrl: 'http://image/3',
        durationMinutes: 200,
        releaseDate: '2024-02-02',
        rating: 4.2,
        genres: ['history'],
      },
    ];

    audibleServiceMock.getPopularAudiobooks.mockResolvedValue(popular);
    audibleServiceMock.getNewReleases.mockResolvedValue(newReleases);
    thumbnailCacheMock.cacheThumbnail.mockResolvedValue('cached/path.jpg');
    thumbnailCacheMock.cleanupUnusedThumbnails.mockResolvedValue(2);
    prismaMock.audibleCache.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.audibleCache.upsert.mockResolvedValue({});
    prismaMock.audibleCache.findMany.mockResolvedValue([
      { asin: 'ASIN-1' },
      { asin: 'ASIN-2' },
      { asin: 'ASIN-3' },
    ]);

    const { processAudibleRefresh } = await import('@/lib/processors/audible-refresh.processor');
    const result = await processAudibleRefresh({ jobId: 'job-1' });

    expect(result.success).toBe(true);
    expect(result.popularSaved).toBe(2);
    expect(result.newReleasesSaved).toBe(1);
    expect(prismaMock.audibleCache.updateMany).toHaveBeenCalled();
    expect(prismaMock.audibleCache.upsert).toHaveBeenCalledTimes(3);
    expect(thumbnailCacheMock.cacheThumbnail).toHaveBeenCalledWith('ASIN-1', 'http://image/1');
    expect(thumbnailCacheMock.cacheThumbnail).toHaveBeenCalledWith('ASIN-3', 'http://image/3');
    expect(thumbnailCacheMock.cleanupUnusedThumbnails).toHaveBeenCalled();

    const activeSet = thumbnailCacheMock.cleanupUnusedThumbnails.mock.calls[0][0] as Set<string>;
    expect(Array.from(activeSet).sort()).toEqual(['ASIN-1', 'ASIN-2', 'ASIN-3']);
  });

  it('rethrows fatal errors', async () => {
    prismaMock.audibleCache.updateMany.mockRejectedValue(new Error('DB down'));

    const { processAudibleRefresh } = await import('@/lib/processors/audible-refresh.processor');
    await expect(processAudibleRefresh({ jobId: 'job-2' })).rejects.toThrow('DB down');
  });
});
