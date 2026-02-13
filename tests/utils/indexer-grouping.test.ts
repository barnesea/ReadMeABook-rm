/**
 * Component: Indexer Grouping Utils Tests
 * Documentation: documentation/phase3/prowlarr.md
 */

import { describe, expect, it } from 'vitest';
import {
  getCategoriesForType,
  groupIndexersByCategories,
  getGroupDescription,
  IndexerConfig,
} from '@/lib/utils/indexer-grouping';

describe('getCategoriesForType', () => {
  describe('audiobook', () => {
    it('returns audiobookCategories when set', () => {
      const indexer: IndexerConfig = { id: 1, name: 'Test', audiobookCategories: [3030, 3010] };
      expect(getCategoriesForType(indexer, 'audiobook')).toEqual([3030, 3010]);
    });

    it('returns empty array when audiobookCategories is explicitly empty', () => {
      const indexer: IndexerConfig = { id: 1, name: 'Test', audiobookCategories: [] };
      expect(getCategoriesForType(indexer, 'audiobook')).toEqual([]);
    });

    it('falls back to legacy categories when audiobookCategories is undefined', () => {
      const indexer: IndexerConfig = { id: 1, name: 'Test', categories: [3030, 3040] };
      expect(getCategoriesForType(indexer, 'audiobook')).toEqual([3030, 3040]);
    });

    it('falls back to default [3030] when no fields are set', () => {
      const indexer: IndexerConfig = { id: 1, name: 'Test' };
      expect(getCategoriesForType(indexer, 'audiobook')).toEqual([3030]);
    });

    it('prefers audiobookCategories over legacy categories', () => {
      const indexer: IndexerConfig = {
        id: 1, name: 'Test',
        audiobookCategories: [3010],
        categories: [3030],
      };
      expect(getCategoriesForType(indexer, 'audiobook')).toEqual([3010]);
    });
  });

  describe('ebook', () => {
    it('returns ebookCategories when set', () => {
      const indexer: IndexerConfig = { id: 1, name: 'Test', ebookCategories: [7020, 7050] };
      expect(getCategoriesForType(indexer, 'ebook')).toEqual([7020, 7050]);
    });

    it('returns empty array when ebookCategories is explicitly empty', () => {
      const indexer: IndexerConfig = { id: 1, name: 'Test', ebookCategories: [] };
      expect(getCategoriesForType(indexer, 'ebook')).toEqual([]);
    });

    it('falls back to default [7020] when ebookCategories is undefined', () => {
      const indexer: IndexerConfig = { id: 1, name: 'Test' };
      expect(getCategoriesForType(indexer, 'ebook')).toEqual([7020]);
    });
  });
});

describe('groupIndexersByCategories', () => {
  it('groups indexers with matching categories', () => {
    const indexers: IndexerConfig[] = [
      { id: 1, name: 'A', audiobookCategories: [3030] },
      { id: 2, name: 'B', audiobookCategories: [3030] },
      { id: 3, name: 'C', audiobookCategories: [3030, 3010] },
    ];

    const { groups, skippedIndexers } = groupIndexersByCategories(indexers, 'audiobook');

    expect(groups).toHaveLength(2);
    expect(skippedIndexers).toHaveLength(0);

    const group3030 = groups.find(g => g.categories.length === 1 && g.categories[0] === 3030);
    expect(group3030).toBeDefined();
    expect(group3030!.indexerIds).toEqual([1, 2]);

    const groupMulti = groups.find(g => g.categories.length === 2);
    expect(groupMulti).toBeDefined();
    expect(groupMulti!.indexerIds).toEqual([3]);
  });

  it('sorts categories for consistent grouping regardless of order', () => {
    const indexers: IndexerConfig[] = [
      { id: 1, name: 'A', audiobookCategories: [3010, 3030] },
      { id: 2, name: 'B', audiobookCategories: [3030, 3010] },
    ];

    const { groups } = groupIndexersByCategories(indexers, 'audiobook');

    expect(groups).toHaveLength(1);
    expect(groups[0].indexerIds).toEqual([1, 2]);
    expect(groups[0].categories).toEqual([3010, 3030]);
  });

  it('skips indexers with empty categories for the requested type', () => {
    const indexers: IndexerConfig[] = [
      { id: 1, name: 'Active', audiobookCategories: [3030], ebookCategories: [7020] },
      { id: 2, name: 'Disabled', audiobookCategories: [], ebookCategories: [7020] },
      { id: 3, name: 'Also Active', audiobookCategories: [3030], ebookCategories: [] },
    ];

    // Audiobook search: indexer 2 is skipped
    const audioResult = groupIndexersByCategories(indexers, 'audiobook');
    expect(audioResult.groups).toHaveLength(1);
    expect(audioResult.groups[0].indexerIds).toEqual([1, 3]);
    expect(audioResult.skippedIndexers).toHaveLength(1);
    expect(audioResult.skippedIndexers[0].id).toBe(2);

    // Ebook search: indexer 3 is skipped
    const ebookResult = groupIndexersByCategories(indexers, 'ebook');
    expect(ebookResult.groups).toHaveLength(1);
    expect(ebookResult.groups[0].indexerIds).toEqual([1, 2]);
    expect(ebookResult.skippedIndexers).toHaveLength(1);
    expect(ebookResult.skippedIndexers[0].id).toBe(3);
  });

  it('returns empty groups when all indexers are disabled for the type', () => {
    const indexers: IndexerConfig[] = [
      { id: 1, name: 'A', audiobookCategories: [] },
      { id: 2, name: 'B', audiobookCategories: [] },
    ];

    const { groups, skippedIndexers } = groupIndexersByCategories(indexers, 'audiobook');

    expect(groups).toHaveLength(0);
    expect(skippedIndexers).toHaveLength(2);
  });

  it('handles legacy configs without audiobookCategories field', () => {
    const indexers: IndexerConfig[] = [
      { id: 1, name: 'Legacy', categories: [3030] },
      { id: 2, name: 'New', audiobookCategories: [3030] },
    ];

    const { groups, skippedIndexers } = groupIndexersByCategories(indexers, 'audiobook');

    expect(groups).toHaveLength(1);
    expect(groups[0].indexerIds).toEqual([1, 2]);
    expect(skippedIndexers).toHaveLength(0);
  });

  it('defaults to audiobook type when not specified', () => {
    const indexers: IndexerConfig[] = [
      { id: 1, name: 'Test', audiobookCategories: [3030], ebookCategories: [7020] },
    ];

    const { groups } = groupIndexersByCategories(indexers);

    expect(groups).toHaveLength(1);
    expect(groups[0].categories).toEqual([3030]);
  });

  it('handles custom category IDs', () => {
    const indexers: IndexerConfig[] = [
      { id: 1, name: 'A', audiobookCategories: [3030, 99999] },
      { id: 2, name: 'B', audiobookCategories: [3030, 99999] },
      { id: 3, name: 'C', audiobookCategories: [3030] },
    ];

    const { groups } = groupIndexersByCategories(indexers, 'audiobook');

    expect(groups).toHaveLength(2);
    const customGroup = groups.find(g => g.categories.includes(99999));
    expect(customGroup).toBeDefined();
    expect(customGroup!.indexerIds).toEqual([1, 2]);
  });

  it('handles empty indexer array', () => {
    const { groups, skippedIndexers } = groupIndexersByCategories([], 'audiobook');
    expect(groups).toHaveLength(0);
    expect(skippedIndexers).toHaveLength(0);
  });
});

describe('getGroupDescription', () => {
  it('returns human-readable description', () => {
    const description = getGroupDescription({
      categories: [3030, 3010],
      indexerIds: [1, 2],
      indexers: [
        { id: 1, name: 'Indexer A' },
        { id: 2, name: 'Indexer B' },
      ],
    });

    expect(description).toBe('2 indexers (Indexer A, Indexer B) with categories [3030, 3010]');
  });

  it('uses singular for single indexer', () => {
    const description = getGroupDescription({
      categories: [3030],
      indexerIds: [1],
      indexers: [{ id: 1, name: 'Solo' }],
    });

    expect(description).toBe('1 indexer (Solo) with categories [3030]');
  });
});
