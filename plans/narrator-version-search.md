# Narrator/Version Search Feature - Implementation Plan

**Status:** 📋 Planning Phase

## Overview
Add feature to search for all narrator versions of an audiobook when user requests it or views details. Present a selection menu to choose the desired narrator/version, then use that specific version's title in the torrent search query.

## Requirements Summary
- Search for all versions/narrators when user presses request button OR enters detail view
- Use both Audible scraping AND Audnexus API to find all editions
- Show narrator selection modal before creating request
- Include narrator in torrent search query for audiobooks
- Exclude narrator from ebook sidecar downloads (use base title only)

---

## Architecture

### Data Flow
```
User Action (Request Button / Detail View)
    ↓
SearchAllVersions API (Audible + Audnexus)
    ↓
Cache Versions in Frontend State
    ↓
Show Narrator Selection Modal
    ↓
User Selects Narrator
    ↓
Create Request with Selected Narrator
    ↓
Search Indexers (with narrator in query)
    ↓
Download Selected Version
```

### Key Components

#### 1. Backend API: `/api/audiobooks/[asin]/versions`
- Search Audible for all versions of a title
- Use Audnexus API to get edition information
- Return list of all narrators/versions with ASINs

#### 2. Frontend: Narrator Selection Modal
- Show after searching for versions
- Display list of available narrators
- Allow user to select preferred narrator
- Pass selected narrator info to request creation

#### 3. Updated Request Flow
- Search for versions → User selects → Create request with narrator
- Search indexers using selected narrator's title
- Ebook search uses base title (without narrator)

---

## Implementation Steps

### Step 1: Backend - Search All Versions API

**File:** `src/app/api/audiobooks/[asin]/versions/route.ts`

```typescript
GET /api/audiobooks/[asin]/versions
```

**Functionality:**
1. Fetch main book details from Audnexus
2. Scrape Audible for all versions of the title
3. Extract unique narrator combinations
4. Return list of versions with ASIN, title, narrator, author

**Response:**
```typescript
{
  success: boolean;
  versions: Array<{
    asin: string;
    title: string;
    author: string;
    narrator: string;
    coverArtUrl?: string;
    durationMinutes?: number;
  }>;
  baseTitle: string; // Original search title
}
```

---

### Step 2: Frontend - Narrator Selection Modal

**File:** `src/components/audiobooks/NarratorSelectionModal.tsx`

**Props:**
```typescript
interface NarratorSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: Array<{
    asin: string;
    title: string;
    author: string;
    narrator: string;
    coverArtUrl?: string;
    durationMinutes?: number;
  }>;
  onSelect: (version: { asin: string; title: string; author: string; narrator: string }) => void;
}
```

**UI Elements:**
- List of all versions with narrator info
- Cover art preview
- Duration display
- Select button for each version

---

### Step 3: Update Request Creation Flow

**File:** `src/components/audiobooks/AudiobookCard.tsx`
**File:** `src/components/audiobooks/AudiobookDetailsModal.tsx`

**Changes:**
1. Before creating request, search for all versions
2. Show narrator selection modal
3. User selects narrator
4. Create request with selected narrator's ASIN/title

**Updated `handleRequest` flow:**
```typescript
const handleRequest = async () => {
  // 1. Search for all versions
  const versions = await searchAllVersions(audiobook.asin);
  
  // 2. Show selection modal
  const selectedVersion = await showNarratorSelection(versions);
  
  // 3. Create request with selected version
  await createRequest(selectedVersion);
};
```

---

### Step 4: Update Search Indexers Processor

**File:** `src/lib/processors/search-indexers.processor.ts`

**Changes:**
1. Include narrator in search query when available
2. Log the full search query for transparency

**Updated search query:**
```typescript
// If narrator is provided, include it in search
const searchQuery = narrator 
  ? `${audiobook.title} ${audiobook.narrator}`
  : audiobook.title;
```

**Log output example:**
```
Searching for: "The Martian - Narrated by Jeff Daniels"
```

---

### Step 5: Update Ebook Search (Exclude Narrator)

**File:** `src/lib/processors/search-ebook.processor.ts`

**Changes:**
1. Use base title without narrator for Anna's Archive search
2. Use base title without narrator for indexer search

**Search query:**
```typescript
// Ebook search always uses base title (no narrator)
const searchQuery = audiobook.title;
```

---

### Step 6: Frontend Hooks

**File:** `src/lib/hooks/useAudiobooks.ts`

**Add new hook:**
```typescript
export function useSearchAllVersions(asin: string | null) {
  // Fetch versions from /api/audiobooks/[asin]/versions
}
```

---

## Detailed Implementation Tasks

### Backend Tasks

1. **Create `/api/audiobooks/[asin]/versions/route.ts`**
   - Search Audible for all versions of title
   - Use Audnexus API for edition data
   - Return unique narrator combinations
   - Include logging for transparency

2. **Update `/api/requests/route.ts`**
   - Accept optional `narrator` field in request body
   - Store narrator in audiobook record
   - Pass narrator to search job

3. **Update `search-indexers.processor.ts`**
   - Include narrator in search query
   - Log full search query

### Frontend Tasks

1. **Create `NarratorSelectionModal.tsx`**
   - Display list of versions
   - Show narrator info for each
   - Handle selection

2. **Update `AudiobookCard.tsx`**
   - Search versions before request
   - Show selection modal
   - Pass selected version to createRequest

3. **Update `AudiobookDetailsModal.tsx`**
   - Search versions on open (if not available)
   - Add narrator selection section
   - Pass selected version to createRequest

4. **Update `useAudiobooks.ts`**
   - Add `useSearchAllVersions` hook

5. **Update `useRequests.ts`**
   - Update `createRequest` to accept narrator
   - Update `requestWithTorrent` to accept narrator

---

## Logging Requirements

### Search All Versions
```
Searching for all versions of "The Martian"...
Found 3 versions via Audible scraping
Found 2 editions via Audnexus API
Total unique versions: 4
Versions: [
  { asin: "B002V123", title: "The Martian", narrator: "Jeff Daniels" },
  { asin: "B002V456", title: "The Martian", narrator: "Rufus Sewell" },
  { asin: "B002V789", title: "The Martian", narrator: "John Lee" }
]
```

### Search Indexers (with narrator)
```
Searching for: "The Martian - Narrated by Jeff Daniels"
Found 15 results
Selected: "The Martian - Jeff Daniels - 10.5 hours"
```

### Ebook Search (without narrator)
```
Searching Anna's Archive for: "The Martian"
Searching indexers for: "The Martian"
```

---

## Error Handling

1. **No versions found:**
   - Fallback to original ASIN/title
   - Log warning
   - Continue with original request

2. **Search timeout:**
   - Show error in modal
   - Allow user to proceed with original version
   - Or retry search

3. **API errors:**
   - Graceful degradation
   - Use original audiobook data if version search fails

---

## Testing Checklist

- [ ] Search for versions from search result card
- [ ] Search for versions from details modal
- [ ] Narrator selection modal displays correctly
- [ ] Request created with selected narrator
- [ ] Torrent search includes narrator in query
- [ ] Ebook search excludes narrator
- [ ] Error handling works when no versions found
- [ ] Build succeeds with `docker compose build`

---

## Files to Create/Modify

### New Files
- `src/app/api/audiobooks/[asin]/versions/route.ts`
- `src/components/audiobooks/NarratorSelectionModal.tsx`

### Modified Files
- `src/app/api/requests/route.ts`
- `src/lib/processors/search-indexers.processor.ts`
- `src/lib/processors/search-ebook.processor.ts`
- `src/components/audiobooks/AudiobookCard.tsx`
- `src/components/audiobooks/AudiobookDetailsModal.tsx`
- `src/lib/hooks/useAudiobooks.ts`
- `src/lib/hooks/useRequests.ts`

---

## Notes

- Version search should be cached in frontend state (not DB)
- Search should happen before request creation (not as background job)
- Narrator should be stored in audiobook record for future reference
- Ebook sidecar should always use base title (no narrator specification)
- All search queries should be logged for debugging