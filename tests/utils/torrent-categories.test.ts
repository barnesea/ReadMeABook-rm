/**
 * Component: Torrent Category Utils Tests
 * Documentation: documentation/phase3/prowlarr.md
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  TORRENT_CATEGORIES,
  areAllChildrenSelected,
  getChildIds,
  getParentId,
  isParentCategory,
  getAllStandardCategoryIds,
  isStandardCategory,
} from '@/lib/utils/torrent-categories';

describe('torrent categories', () => {
  it('returns child ids for parent categories', () => {
    expect(getChildIds(3000)).toContain(3030);
    expect(getChildIds(8000)).toEqual([]);
  });

  it('returns parent id for child categories', () => {
    expect(getParentId(3030)).toBe(3000);
    expect(getParentId(9999)).toBeNull();
  });

  it('checks if all children are selected', () => {
    const childIds = getChildIds(3000);
    expect(areAllChildrenSelected(3000, childIds)).toBe(true);
    expect(areAllChildrenSelected(3000, [])).toBe(false);
  });

  it('detects parent categories', () => {
    expect(isParentCategory(3000)).toBe(true);
    expect(isParentCategory(3030)).toBe(false);
  });

  it('keeps default categories stable', () => {
    expect(DEFAULT_CATEGORIES).toEqual([3030]);
    expect(TORRENT_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('returns all standard category IDs including parents and children', () => {
    const ids = getAllStandardCategoryIds();
    expect(ids.has(3000)).toBe(true); // parent
    expect(ids.has(3030)).toBe(true); // child
    expect(ids.has(7020)).toBe(true); // child
    expect(ids.has(8000)).toBe(true); // parent with no children
    expect(ids.has(99999)).toBe(false); // not a standard category
  });

  it('identifies standard vs custom categories', () => {
    expect(isStandardCategory(3000)).toBe(true);
    expect(isStandardCategory(3030)).toBe(true);
    expect(isStandardCategory(7020)).toBe(true);
    expect(isStandardCategory(8000)).toBe(true);
    expect(isStandardCategory(12345)).toBe(false);
    expect(isStandardCategory(0)).toBe(false);
  });
});
