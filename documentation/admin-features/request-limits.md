# Request Limits Feature

**Status:** ✅ Implemented | Server-wide and per-user request rate limiting

## Overview

Configurable request limits that allow admins to set maximum number of requests per time period for users. Supports both server-wide defaults and per-user overrides.

## Key Details

### Configuration
- **Server-wide defaults**: Configured in admin settings (Request Limits tab)
- **Per-user overrides**: Configured in admin users page
- **Limit type**: Rolling window (n requests per m days)

### Configuration Keys
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `request_limit.enabled` | boolean | false | Enable server-wide request limits |
| `request_limit.count` | integer | 5 | Max requests per period |
| `request_limit.period` | integer | 7 | Period in days |

### User Fields
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `requestLimitEnabled` | boolean | false | Enable per-user limit |
| `requestLimitCount` | integer | 0 | Max requests per period (0 = use global) |
| `requestLimitPeriod` | integer | 0 | Period in days (0 = use global) |

### Limit Logic
1. If user's `requestLimitEnabled` is true → Use user's `requestLimitCount` and `requestLimitPeriod`
2. Otherwise → Use server-wide defaults
3. If count or period is 0 → Unlimited requests
4. Only counts requests created in the rolling window
5. Completed/failed/cancelled requests don't count toward limit

## API Endpoints

### GET /api/admin/settings/request-limits
Get server-wide request limit configuration

**Auth:** Admin only

**Response:**
```json
{
  "success": true,
  "config": {
    "enabled": true,
    "count": 5,
    "period": 7
  }
}
```

### PUT /api/admin/settings/request-limits
Update server-wide request limit configuration

**Auth:** Admin only

**Request:**
```json
{
  "enabled": true,
  "count": 5,
  "period": 7
}
```

**Response:**
```json
{
  "success": true,
  "message": "Request limit configuration updated successfully",
  "config": {
    "enabled": true,
    "count": 5,
    "period": 7
  }
}
```

### POST /api/requests
Create a new request (with limit check)

**Auth:** User or Admin

**Limit Check:**
- If user at limit → Returns 429 with error details
- If limit disabled or 0 → Allows unlimited requests

**Error Response (429):**
```json
{
  "error": "RequestLimitExceeded",
  "message": "You have reached your request limit of 5 requests per 7 days. Your limit will reset in approximately 48 hours.",
  "limit": {
    "count": 5,
    "periodDays": 7,
    "requestsMade": 5,
    "resetAt": "2026-02-14T03:00:00Z"
  }
}
```

### PUT /api/admin/users/[id]
Update user (includes request limit fields)

**Auth:** Admin only

**Request:**
```json
{
  "role": "user",
  "requestLimitEnabled": true,
  "requestLimitCount": 10,
  "requestLimitPeriod": 14
}
```

## UI Features

### Admin Settings (Request Limits Tab)
- Enable toggle for server-wide limits
- Count input (max requests per period)
- Period input (days)
- Save button with validation
- Info alert explaining how limits work

### Admin Users Page
- Per-user limit configuration:
  - Override toggle (use global vs custom)
  - Custom count/period inputs
  - Current usage display

### User Request Page
- Display current limit status
- Show when limit will reset
- Show how many requests remaining

## Database Schema

### User Table
```prisma
requestLimitEnabled Boolean @default(false) @map("request_limit_enabled")
requestLimitCount   Int     @default(0) @map("request_limit_count")
requestLimitPeriod  Int     @default(0) @map("request_limit_period")
```

### Configuration Table
```prisma
key: 'request_limit.enabled'  // 'true' | 'false'
key: 'request_limit.count'    // number as string
key: 'request_limit.period'   // number as string
```

## Files Modified

### Backend
- `prisma/schema.prisma` - Added request limit fields to User table
- `src/lib/services/config.service.ts` - Added request limit config methods
- `src/app/api/requests/route.ts` - Added limit check before creating requests
- `src/app/api/admin/settings/request-limits/route.ts` - New API endpoint
- `src/app/api/admin/users/[id]/route.ts` - Added request limit fields to user update

### Frontend
- `src/app/admin/settings/page.tsx` - Added Request Limits tab
- `src/app/admin/settings/lib/helpers.ts` - Added request-limits tab handling
- `src/app/admin/settings/lib/types.ts` - Added RequestLimitSettings type
- `src/app/admin/settings/tabs/RequestLimitsTab/RequestLimitsTab.tsx` - New tab component

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

## Rollback Plan

If issues arise:
1. Set `request_limit.enabled` to 'false'
2. All users revert to unlimited requests
3. No data loss (existing requests unaffected)