# Request Limit Feature - Implementation Plan

**Status:** 🏗️ Architect Phase | User request rate limiting per time period

## Overview

Implement configurable request limits that allow admins to set:
- **Server-wide default**: Maximum n requests per m days for all new users
- **Per-user override**: Individual users can have different limits

## Requirements

1. **Limit Type**: n new requests per m days (rolling window)
2. **Enforcement**: Block new requests when limit reached
3. **Scope**: Only new requests count (completed/available/failed/cancelled don't count)
4. **Isolation**: User hitting limit doesn't affect their existing requests
5. **Configurability**: Both server-wide default and per-user limits

## Database Schema Changes

### User Table
Add two new fields:
```prisma
requestLimitEnabled Boolean @default(false) @map("request_limit_enabled")
requestLimitCount   Int     @default(0) @map("request_limit_count")     // n requests
requestLimitPeriod  Int     @default(0) @map("request_limit_period")    // m days
```

### Configuration Table
Add server-wide defaults:
- `request_limit.enabled` (string: 'true'/'false')
- `request_limit.count` (string: number)
- `request_limit.period` (string: number)

## Implementation Steps

### 1. Database Schema Update
- Add 3 new fields to User table
- Create migration via `prisma db push`
- Update documentation/backend/database.md

### 2. Configuration Service Updates
- Add new configuration keys for server-wide defaults
- Update ConfigService to handle request limit config
- Add default values for new keys

### 3. Request Creation Logic
- Modify `POST /api/requests` to check limit before creating request
- Query: Count requests created in last `requestLimitPeriod` days for user
- If count >= `requestLimitCount`, return 429 error
- Allow admins to bypass limit (optional: add admin bypass flag)

### 4. Admin UI Updates
- Add "Request Limits" section to admin settings
- Configure server-wide defaults (enabled, count, period)
- Per-user limit configuration in admin users page

### 5. API Endpoints
- `GET /api/admin/settings/request-limits` - Get server-wide defaults
- `PUT /api/admin/settings/request-limits` - Update server-wide defaults
- `PUT /api/admin/users/[id]` - Update per-user limit (extend existing endpoint)
- `GET /api/admin/users/[id]/request-limits` - Get user's current limit status

## API Response for Blocked Request

```json
{
  "error": "RequestLimitExceeded",
  "message": "You have reached your request limit. You can make 5 requests per 7 days. Your limit will reset in 2 days.",
  "limit": {
    "count": 5,
    "periodDays": 7,
    "requestsMade": 5,
    "resetAt": "2026-02-14T03:00:00Z"
  }
}
```

## UI Components

### Admin Settings (SettingsTab)
- Request Limits section with:
  - Enable toggle
  - Count input (number)
  - Period input (number of days)
  - Save button with validation

### Admin Users Page
- Per-user limit configuration:
  - Override toggle (use global vs custom)
  - Custom count/period inputs
  - Current usage display

### User Request Page
- Display current limit status
- Show when limit will reset
- Show how many requests remaining

## Edge Cases

1. **New user with no limit set**: Use server-wide default
2. **Server-wide limit disabled**: All users can create unlimited requests
3. **User limit set to 0**: Block all requests (or treat as unlimited?)
4. **Period of 0**: Treat as unlimited?
5. **Admin users**: Should admins bypass limit? (Default: yes)

## Configuration Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `request_limit.enabled` | boolean | false | Enable server-wide request limits |
| `request_limit.count` | integer | 5 | Max requests per period |
| `request_limit.period` | integer | 7 | Period in days |

## Files to Modify

### Backend
- `prisma/schema.prisma` - Add User table fields
- `src/lib/services/config.service.ts` - Add request limit config
- `src/app/api/requests/route.ts` - Add limit check
- `src/app/api/admin/settings/request-limits/route.ts` - New endpoint
- `src/app/api/admin/users/[id]/route.ts` - Update user update endpoint

### Frontend
- `src/app/admin/settings/page.tsx` - Add Request Limits tab/section
- `src/app/admin/settings/tabs/RequestLimitsTab/` - New tab component
- `src/app/admin/users/page.tsx` - Add per-user limit controls
- `src/app/requests/page.tsx` - Display limit status to users

### Documentation
- `documentation/backend/database.md` - Update schema
- `documentation/backend/services/config.md` - Add request limit config
- `documentation/settings-pages.md` - Add Request Limits section

## Testing Strategy

1. **Unit Tests**:
   - Limit check logic with various scenarios
   - Edge cases (0 count, 0 period, null values)

2. **Integration Tests**:
   - Create requests up to limit
   - Verify 429 error when limit exceeded
   - Verify limit resets after period

3. **Admin UI Tests**:
   - Configure server-wide limits
   - Configure per-user limits
   - Verify limits are applied

## Migration Plan

1. Add new User table fields (null-safe)
2. Deploy backend changes
3. Admin configures server-wide defaults
4. Admin sets per-user limits as needed
5. Feature becomes active

## Rollback Plan

If issues arise:
1. Set `request_limit.enabled` to 'false'
2. All users revert to unlimited requests
3. No data loss (existing requests unaffected)