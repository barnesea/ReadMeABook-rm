# Library Reorganization Feature

**Status:** ✅ Implemented

Feature to reorganize manually added books (books in library not created by RMAB requests) to match the configured audiobook organization template.

## Overview

When users manually add audiobooks to their library (Plex/Audiobookshelf) outside of RMAB, those books may not follow the configured organization template. This feature identifies such books and reorganizes them to match the template format.

## Key Requirements

1. **Only manually added books** - Identify books that exist in `plex_library` but were NOT created by RMAB requests
2. **Scheduled task** - Run automatically (disabled by default)
3. **Template-based** - Uses `audiobook_path_template` config (dynamic, configurable)
4. **Non-destructive** - Copy files to new location, keep originals until verified

## Data Model Analysis

### Current State

**`plex_library` table:**
- `id`, `plex_guid`, `title`, `author`, `narrator`, `asin`, `isbn`, `file_path`, etc.
- Stores all books in the library (Plex or Audiobookshelf)

**`audiobooks` table:**
- `id`, `audible_asin`, `title`, `author`, `plex_guid`, `abs_item_id`, `file_path`, `files_hash`, etc.
- Only stores books that were REQUESTED through RMAB

**`requests` table:**
- `id`, `user_id`, `audiobook_id`, `status`, etc.
- Tracks user requests

### Identifying Manually Added Books

A book in `plex_library` is "manually added" if:
1. It exists in `plex_library`
2. It does NOT have a corresponding entry in `audiobooks` table (no RMAB request)
3. OR: It has a `plex_guid` that doesn't match any `audiobooks.plex_guid`

**Query approach:**
```sql
SELECT pl.*
FROM plex_library pl
LEFT JOIN audiobooks ab ON (
  (pl.plex_guid = ab.plex_guid AND pl.plex_guid IS NOT NULL)
  OR (pl.asin = ab.audible_asin AND pl.asin IS NOT NULL)
)
WHERE ab.id IS NULL
  AND pl.plex_library_id = ?;
```

## Implementation Plan

### 1. New Configuration Key

**Key:** `library_reorganization.enabled`
**Type:** boolean
**Default:** false
**Category:** library

**Key:** `library_reorganization.scan_interval_minutes`
**Type:** number
**Default:** 1440 (24 hours)
**Category:** library

### 2. New Job Type

Add to `Job.type` enum:
- `reorganize_library` - Reorganize manually added books

### 3. New Processor

**File:** `src/lib/processors/reorganize-library.processor.ts`

**Function:** `processReorganizeLibrary(payload: ReorganizeLibraryPayload)`

**Payload:**
```typescript
interface ReorganizeLibraryPayload {
  libraryId: string;
  jobId: string;
}
```

**Process:**
1. Get all manually added books (no RMAB request)
2. For each book:
   - Get metadata from `plex_library` (title, author, narrator, asin, year, etc.)
   - Build new target path using `audiobook_path_template`
   - Copy files from current location to new location
   - Update `plex_library.file_path` with new path
   - Trigger library rescan (if enabled)
3. Log results

### 4. File Organization Logic

**Reusing existing `FileOrganizer`:**
- Use `FileOrganizer.organize()` method
- Pass metadata from `plex_library` record
- Copy files to new template-based path
- Keep original files (don't delete)

**New method needed:** `FileOrganizer.reorganizeExistingBook()`
- Takes existing file paths
- Copies to new location
- Updates database
- Returns result

### 5. Database Updates

**Update `plex_library` table:**
- `file_path` - Update to new path after reorganization
- `lastReorganizedAt` - New column (timestamp)
- `reorganizedBy` - New column (job_id or 'manual')

**Migration needed:**
```sql
ALTER TABLE plex_library ADD COLUMN last_reorganized_at TIMESTAMP;
ALTER TABLE plex_library ADD COLUMN reorganized_by UUID;
```

### 6. Library Rescan Triggering

After reorganization:
- If `plex.trigger_scan_after_import` or `audiobookshelf.trigger_scan_after_import` is enabled
- Trigger library scan to detect new file locations
- This ensures the library shows the reorganized books

### 7. Admin Settings UI

**Paths Tab:**
- Add toggle: "Automatically reorganize manually added books"
- Add field: "Reorganization scan interval (minutes)"
- Add button: "Run reorganization now"

**Log output:**
- Show count of books reorganized
- Show any errors encountered
- Show time taken

## File Structure

```
src/
├── lib/
│   ├── processors/
│   │   └── reorganize-library.processor.ts  # NEW
│   └── services/
│       └── library-reorganization.service.ts  # NEW
```

## API Endpoints

### POST /api/admin/library/reorganize
Trigger reorganization job immediately.

**Request:**
```json
{
  "libraryId": "optional-library-id"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "message": "Reorganization job queued"
}
```

### GET /api/admin/library/reorganize/status
Get reorganization status and statistics.

**Response:**
```json
{
  "enabled": true,
  "scanIntervalMinutes": 1440,
  "lastRunAt": "2024-01-01T00:00:00Z",
  "lastRunStats": {
    "totalBooks": 100,
    "reorganized": 25,
    "skipped": 75,
    "errors": 0
  }
}
```

## Configuration Schema

```typescript
interface LibraryReorganizationConfig {
  enabled: boolean;
  scanIntervalMinutes: number;
}
```

## Edge Cases

1. **Book already at correct path** - Skip reorganization
2. **File not found at original path** - Log error, skip book
3. **Copy fails** - Log error, keep original, don't update DB
4. **Template variables missing** - Use defaults (author/title only)
5. **Multiple books with same ASIN** - Handle gracefully

## Security Considerations

1. **Admin-only endpoint** - Only admins can trigger reorganization
2. **Path validation** - Ensure template is valid before running
3. **Disk space check** - Verify sufficient space before copying
4. **Error handling** - Don't delete originals until copy verified

## Testing Strategy

1. **Unit tests:**
   - `reorganize-library.processor.test.ts`
   - `library-reorganization.service.test.ts`

2. **Integration tests:**
   - Test with mock library items
   - Test template substitution
   - Test file copy operations

3. **Manual testing:**
   - Add book manually to library
   - Run reorganization
   - Verify files moved to correct location
   - Verify DB updated

## Migration Plan

1. **Phase 1:** Create database migration
2. **Phase 2:** Implement processor and service
3. **Phase 3:** Add admin settings UI
4. **Phase 4:** Add scheduled task
5. **Phase 5:** Testing and documentation

## Related Files

- `src/lib/processors/scan-plex.processor.ts` - Existing library scan
- `src/lib/utils/file-organizer.ts` - File organization logic
- `src/lib/utils/path-template.util.ts` - Template engine
- `src/app/admin/settings/tabs/PathsTab/PathsTab.tsx` - Settings UI
- `documentation/backend/services/jobs.md` - Job queue documentation