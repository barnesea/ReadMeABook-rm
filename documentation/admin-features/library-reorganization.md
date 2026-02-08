# Library Reorganization Feature

**Status:** 🏗️ In Progress

Feature to reorganize manually added books (books in library not created by RMAB requests) to match the configured audiobook organization template.

## Overview

When users manually add audiobooks to their library (Plex or Audiobookshelf) outside of RMAB, those books may not follow the configured organization template. This feature identifies such books and reorganizes them to match the template format.

## Key Details

- **Identifies manually added books** - Books in `plex_library` without corresponding RMAB requests
- **Scheduled task** - Runs automatically (disabled by default)
- **Template-based** - Uses `audiobook_path_template` config (dynamic, configurable)
- **Non-destructive** - Copies files to new location, keeps originals until verified

## Configuration

### Configuration Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `library_reorganization.enabled` | boolean | `false` | Enable automatic reorganization |
| `library_reorganization.scan_interval_minutes` | number | `1440` (24h) | Scan interval in minutes |

### Default Scheduled Job

| Name | Type | Schedule | Enabled |
|------|------|----------|---------|
| Reorganize Library | `reorganize_library` | `0 2 * * *` (Daily at 2 AM) | No |

## Process

1. **Identify manually added books** - Query `plex_library` for books without RMAB requests
2. **Build target path** - Apply `audiobook_path_template` to book metadata
3. **Copy files** - Copy from current location to new template-based path
4. **Update database** - Update `plex_library.file_path` with new path
5. **Trigger scan** - If enabled, trigger library scan to detect new files

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

## Database Changes

No database migration needed. Uses existing `plex_library.file_path` column.

## Related Files

- `src/lib/processors/reorganize-library.processor.ts` - Job processor
- `src/lib/services/job-queue.service.ts` - Job queue (added `reorganize_library` type)
- `src/lib/services/scheduler.service.ts` - Scheduler (added default job)
- `src/lib/utils/file-organizer.ts` - File organization utilities
- `src/app/admin/settings/tabs/PathsTab/PathsTab.tsx` - Settings UI (needs update)

## Implementation Notes

- Uses existing `FileOrganizer` class for file operations
- Copies files (doesn't delete originals) for safety
- Updates `plex_library.file_path` after successful copy
- Triggers library scan if `trigger_scan_after_import` is enabled
- Logs all operations with job-specific logger