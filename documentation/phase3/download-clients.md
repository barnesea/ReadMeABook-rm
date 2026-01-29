# Multi-Download-Client Support

**Status:** ✅ Implemented | Simultaneous qBittorrent + SABnzbd support

## Overview
Users can configure both qBittorrent (torrents) and SABnzbd (Usenet) simultaneously. System selects best release across all indexer types regardless of protocol.

**Constraint:** 1 client per type (torrent/usenet) for now; architecture supports future expansion.

## Key Details

### Configuration Structure
**Key:** `download_clients` (JSON array, replaces legacy flat keys)

```typescript
interface DownloadClientConfig {
  id: string;                    // UUID
  type: 'qbittorrent' | 'sabnzbd';
  name: string;                  // User-friendly name
  enabled: boolean;
  url: string;
  username?: string;             // qBittorrent only
  password: string;              // Password or API key
  disableSSLVerify: boolean;
  remotePathMappingEnabled: boolean;
  remotePath?: string;
  localPath?: string;
  category?: string;             // Default: 'readmeabook'
}
```

### Download Client Manager Service
**File:** `src/lib/services/download-client-manager.service.ts`

**Methods:**
- `getClientForProtocol(protocol: 'torrent' | 'usenet')` - Get client by protocol
- `hasClientForProtocol(protocol)` - Check if protocol configured
- `getAllClients()` - List all configs
- `testConnection(config)` - Test specific config
- `invalidate()` - Clear cache on config change
- `getClientServiceForProtocol(protocol)` - Get instantiated service

**Singleton Pattern:** Uses caching with invalidation on config changes.

### Protocol Filtering
**File:** `src/lib/integrations/prowlarr.service.ts:379`

**Logic:**
- Both clients configured: Return all results (mixed torrent + NZB)
- Only torrent client: Filter for torrent results only
- Only usenet client: Filter for NZB results only
- No clients: Return empty

### Download Routing
**File:** `src/lib/processors/download-torrent.processor.ts:44`

**Logic:**
1. Detect protocol from result (`ProwlarrService.isNZBResult()`)
2. Get appropriate client via manager (`getClientForProtocol()`)
3. Route to qBittorrent or SABnzbd service
4. Create download history record

### Migration
**Auto-migration** from legacy single-client config to new JSON array format on first access:
- Reads legacy keys: `download_client_type`, `download_client_url`, etc.
- Converts to single-client array
- Saves as `download_clients` JSON
- Legacy keys remain for backward compatibility (cleaned up on migration)

## API Routes

**GET /api/admin/settings/download-clients** - List all configured clients
**POST /api/admin/settings/download-clients** - Add new client
**PUT /api/admin/settings/download-clients/[id]** - Update client by ID
**DELETE /api/admin/settings/download-clients/[id]** - Delete client by ID
**POST /api/admin/settings/download-clients/test** - Test connection

**Validation:**
- Only 1 client per type allowed (enforced on add)
- Test connection required before save
- Password masking in responses (`********`)

## UI Components

**Directory:** `src/components/admin/download-clients/`

| Component | Purpose |
|-----------|---------|
| `DownloadClientManagement.tsx` | Container with add buttons + configured cards |
| `DownloadClientCard.tsx` | Card with name, type badge, edit/delete |
| `DownloadClientModal.tsx` | Add/edit modal with type-specific fields |

**UI Flow:**
1. **Add Client Section:** Two cards (qBittorrent, SABnzbd) with "Add" button or "Already configured" badge
2. **Configured Clients:** Grid of cards showing name, type, URL, status
3. **Modal:** Type-specific fields, SSL toggle, path mapping, test connection

## Integration Points

### Settings Tab
**File:** `src/app/admin/settings/tabs/DownloadTab/DownloadTab.tsx`

Replaced legacy form with `<DownloadClientManagement mode="settings" />`

### Wizard Step
**File:** `src/app/setup/steps/DownloadClientStep.tsx`

Replaced single-client form with `<DownloadClientManagement mode="wizard" />`

**Validation:** At least 1 enabled client required to proceed

### Setup Complete API
**File:** `src/app/api/setup/complete/route.ts`

Accepts both legacy single client and new array format:
- Legacy: Converts to array on save
- New: Saves directly as `download_clients` JSON

## Edge Cases

**Single client:** Works exactly as before (protocol filtering active)
**No clients:** Wizard requires one; settings shows warning
**Client disabled:** Results for that protocol filtered out
**Connection failure:** Per-download error handling (existing)
**Mixed results:** Best release selected regardless of protocol when both clients configured

## Verification Steps

1. **Migration:** Existing single-client users see config as card after update
2. **Single client:** Configure only qBittorrent → only torrent results shown
3. **Both clients:** Configure both → mixed results, best selected across protocols
4. **Download routing:** Torrent result → qBittorrent; NZB result → SABnzbd
5. **Wizard:** Must add at least one client to proceed
6. **Settings:** Can add/edit/delete/test clients; changes persist

## Critical Files

| File | Changes |
|------|---------|
| `src/lib/services/download-client-manager.service.ts` | **NEW** - Core multi-client service |
| `src/lib/integrations/prowlarr.service.ts:379` | Protocol filtering logic (both clients = all results) |
| `src/lib/processors/download-torrent.processor.ts:44` | Download routing (detect protocol → route) |
| `src/app/api/admin/settings/download-clients/*` | **NEW** - CRUD API routes |
| `src/components/admin/download-clients/*` | **NEW** - UI components (card-based) |
| `src/app/admin/settings/tabs/DownloadTab/DownloadTab.tsx` | Replaced with management component |
| `src/app/setup/steps/DownloadClientStep.tsx` | Replaced with management component |
| `src/app/api/setup/complete/route.ts` | Save as JSON array, support legacy |

## Related

- [qBittorrent Integration](./qbittorrent.md) - Torrent client details
- [SABnzbd Integration](./sabnzbd.md) - Usenet client details
- [Prowlarr Integration](./prowlarr.md) - Indexer search
