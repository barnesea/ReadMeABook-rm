/**
 * Utility: Indexer Grouping by Categories
 * Documentation: documentation/phase3/prowlarr.md
 *
 * Groups indexers by their category configuration to minimize API calls.
 * Indexers with identical categories are grouped together for a single search.
 * Supports separate audiobook and ebook category configurations per indexer.
 * Indexers with no categories for a given type are skipped (effectively disabled).
 */

export type CategoryType = 'audiobook' | 'ebook';

export interface IndexerConfig {
  id: number;
  name: string;
  priority?: number;
  audiobookCategories?: number[]; // Categories for audiobook searches
  ebookCategories?: number[]; // Categories for ebook searches
  categories?: number[]; // Legacy field for backwards compatibility
  [key: string]: any; // Allow other properties
}

export interface IndexerGroup {
  categories: number[];
  indexerIds: number[];
  indexers: IndexerConfig[];
}

export interface GroupingResult {
  groups: IndexerGroup[];
  skippedIndexers: IndexerConfig[]; // Indexers skipped due to no categories for the type
}

/**
 * Gets the appropriate categories from an indexer based on the category type.
 *
 * Returns empty array when the field is explicitly set to [] (user disabled this type).
 * Falls back to defaults only when the field is undefined/missing (legacy configs).
 *
 * @param indexer - The indexer configuration
 * @param type - The category type ('audiobook' or 'ebook')
 * @returns Array of category IDs (empty = disabled for this type)
 */
export function getCategoriesForType(indexer: IndexerConfig, type: CategoryType): number[] {
  if (type === 'ebook') {
    // Field exists (even if empty) — respect it
    if (Array.isArray(indexer.ebookCategories)) {
      return indexer.ebookCategories;
    }
    // Field missing — legacy config, use default
    return [7020];
  }

  // Audiobook — check new field first, then legacy field
  if (Array.isArray(indexer.audiobookCategories)) {
    return indexer.audiobookCategories;
  }
  if (indexer.categories && indexer.categories.length > 0) {
    return indexer.categories; // Legacy fallback
  }
  return [3030]; // Default audiobook category
}

/**
 * Groups indexers by their category configuration.
 * Indexers with identical category arrays are grouped together.
 * Indexers with no categories for the specified type are skipped.
 *
 * @param indexers - Array of indexer configurations
 * @param type - The category type to group by ('audiobook' or 'ebook')
 * @returns GroupingResult with groups and skipped indexers
 *
 * @example
 * const indexers = [
 *   { id: 1, audiobookCategories: [3030], ebookCategories: [7020] },
 *   { id: 2, audiobookCategories: [3030], ebookCategories: [] },
 *   { id: 3, audiobookCategories: [3030, 3010], ebookCategories: [7020] },
 * ];
 *
 * const result = groupIndexersByCategories(indexers, 'ebook');
 * // result.groups: [{ categories: [7020], indexerIds: [1, 3], indexers: [...] }]
 * // result.skippedIndexers: [{ id: 2, ... }]  (no ebook categories)
 */
export function groupIndexersByCategories(
  indexers: IndexerConfig[],
  type: CategoryType = 'audiobook'
): GroupingResult {
  const groupMap = new Map<string, IndexerConfig[]>();
  const skippedIndexers: IndexerConfig[] = [];

  for (const indexer of indexers) {
    const categories = getCategoriesForType(indexer, type);

    // Skip indexers with no categories for this type (effectively disabled)
    if (categories.length === 0) {
      skippedIndexers.push(indexer);
      continue;
    }

    // Sort categories to ensure consistent grouping
    const sortedCategories = [...categories].sort((a, b) => a - b);
    const key = sortedCategories.join(',');

    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key)!.push(indexer);
  }

  const groups: IndexerGroup[] = [];
  for (const [key, indexersInGroup] of groupMap.entries()) {
    const categories = key.split(',').map(Number);
    const indexerIds = indexersInGroup.map(idx => idx.id);

    groups.push({
      categories,
      indexerIds,
      indexers: indexersInGroup,
    });
  }

  return { groups, skippedIndexers };
}

/**
 * Get a human-readable description of an indexer group.
 * Useful for logging and debugging.
 *
 * @param group - The indexer group
 * @returns Description string
 *
 * @example
 * const description = getGroupDescription(group);
 * // "3 indexers (IDs: 1, 2, 5) searching categories [3030, 3010]"
 */
export function getGroupDescription(group: IndexerGroup): string {
  const indexerCount = group.indexerIds.length;
  const indexerNames = group.indexers.map(idx => idx.name).join(', ');
  const categoriesStr = group.categories.join(', ');

  return `${indexerCount} indexer${indexerCount > 1 ? 's' : ''} (${indexerNames}) with categories [${categoriesStr}]`;
}
