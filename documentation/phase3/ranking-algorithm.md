# Intelligent Ranking Algorithm

**Status:** ✅ Implemented

Evaluates and scores torrents to automatically select best audiobook download.

## Scoring Criteria (100 points max)

**1. Title/Author Match (50 pts max) - MOST IMPORTANT**

**Multi-Stage Matching:**

**Stage 1: Word Coverage Filter (MANDATORY)**
- Extracts significant words from request (filters stop words: "the", "a", "an", "of", "on", "in", "at", "by", "for")
- **Parenthetical/bracketed content is optional**: Content in () [] {} treated as subtitle (may be omitted from torrents)
  - "We Are Legion (We Are Bob)" → Required: ["we", "are", "legion"], Optional: ["bob"]
  - "Title [Series Name]" → Required: ["title"], Optional: ["series", "name"]
- Calculates coverage: % of **required** words found in torrent title
- **Hard requirement: 80%+ coverage of required words or automatic 0 score**
- Example: "The Wild Robot on the Island" → ["wild", "robot", "island"]
  - "The Wild Robot" → ["wild", "robot"] → 2/3 = 67% → **REJECTED**
  - "The Wild Robot on the Island" → 3/3 = 100% → **PASSES**
- Example: "We Are Legion (We Are Bob)" → Required: ["we", "are", "legion"]
  - "Dennis E. Taylor - Bobiverse - 01 - We Are Legion" → 3/3 = 100% → **PASSES**
- Prevents wrong series books from matching while handling common subtitle patterns

**Stage 2: Title Matching (0-35 pts)**
- Only scored if Stage 1 passes
- Complete title match requirements (both must be true):
  - No significant words BEFORE matched title (prevents "This Inevitable Ruin Dungeon Crawler Carl, Book 7")
  - Followed by metadata markers: " by", " [", " -", " (", " {", " :", ","
- Complete match → 35 pts
- Title has prefix/suffix words OR continues with more words → fuzzy similarity (partial credit)
- Prevents series confusion: "The Housemaid" vs "The Housemaid's Secret", "Dungeon Crawler Carl" vs "Book 7"
- No substring match → fuzzy similarity (partial credit)

**Stage 3: Author Matching (0-15 pts)**
- Exact substring match → proportional credit
- No exact match → fuzzy similarity (partial credit)
- Splits authors on delimiters (comma, &, "and", " - ")
- Filters out roles ("translator", "narrator")

- Order-independent, no structure assumptions
- Ensures correct book is selected over wrong book with better format

**2. Format Quality (25 pts max)**
- M4B with chapters: 25
- M4B without chapters: 22
- M4A: 16
- MP3: 10
- Other: 3

**3. Seeder Count (15 pts max)**
- Formula: `Math.min(15, Math.log10(seeders + 1) * 6)`
- 1 seeder: 0pts, 10 seeders: 6pts, 100 seeders: 12pts, 1000+: 15pts

**4. Size Reasonableness (10 pts max)**
- Expected: 1-2 MB/min (64-128 kbps)
- Perfect match: 10 pts
- Deviation → penalty
- Unknown duration: 5 pts (neutral)

## Bonus Points System

**Extensible multiplicative bonus system** for external quality factors:

**Indexer Priority Bonus (configurable 1-25, default: 10)**
- Formula: `bonusPoints = baseScore × (priority / 25)`
- Priority 10/25 (40%) → 95 base score → +38 bonus = 133 final
- Priority 20/25 (80%) → 95 base score → +76 bonus = 171 final
- Priority 25/25 (100%) → 95 base score → +95 bonus = 190 final
- Ensures high-quality torrent from low-priority indexer beats low-quality from high-priority
- Bonus scales with quality (better torrents get more benefit from priority)

**Indexer Flag Bonus (configurable -100% to +100%, default: 0%)**
- Formula: `bonusPoints = baseScore × (modifier / 100)`
- Positive modifiers reward desired flags (e.g., "Freeleech" at +50%)
  - +50% modifier → 85 base score → +42.5 bonus = 127.5 final
- Negative modifiers penalize undesired flags (e.g., "Unwanted" at -60%)
  - -60% modifier → 85 base score → -51 penalty = 34 final
- Dual threshold filtering:
  - Base score must be ≥ 50 (quality minimum)
  - Final score must be ≥ 50 (not disqualified by negative bonuses)
  - Negative bonuses can disqualify otherwise good torrents
- Flag extraction from Prowlarr API:
  - `downloadVolumeFactor: 0` → "Freeleech"
  - `downloadVolumeFactor: <1` → "Partial Freeleech"
  - `uploadVolumeFactor: >1` → "Double Upload"
- Case-insensitive, whitespace-trimmed matching
- Universal across all indexers (not indexer-specific)
- Multiple flag bonuses stack (additive)

**Future Modifiers (planned):**
- User preferences
- Custom rules

**Final Score Calculation:**
1. Calculate base score (0-100) using standard criteria
2. Calculate bonus modifiers (indexer priority, flag bonuses, etc.)
3. Sum bonus points
4. Final score = base score + bonus points
5. Apply dual threshold filter:
   - Base score ≥ 50 (quality minimum)
   - Final score ≥ 50 (not disqualified by negative bonuses)
6. Sort by final score (descending), then publish date (descending)

## Tiebreaker Sorting

When multiple torrents have identical final scores:
- **Secondary sort:** Publish date descending (newest first)
- Ensures latest uploads are preferred when quality is equal
- Example: 3 torrents with 171 final score → newest upload ranks #1

## Interface

```typescript
interface IndexerFlagConfig {
  name: string;         // Flag name (e.g., "Freeleech")
  modifier: number;     // -100 to 100 (percentage)
}

interface BonusModifier {
  type: 'indexer_priority' | 'indexer_flag' | 'custom';
  value: number;        // Multiplier (e.g., 0.4 for 40%)
  points: number;       // Calculated bonus points
  reason: string;       // Human-readable explanation
}

interface TorrentResult {
  // ... existing fields
  flags?: string[];     // Extracted flags from Prowlarr API
}

interface RankedTorrent extends TorrentResult {
  score: number;              // Base score (0-100)
  bonusModifiers: BonusModifier[];
  bonusPoints: number;        // Sum of all bonus points
  finalScore: number;         // score + bonusPoints
  rank: number;
  breakdown: {
    formatScore: number;
    seederScore: number;
    sizeScore: number;
    matchScore: number;
    totalScore: number;      // Same as score
    notes: string[];
  };
}

function rankTorrents(
  torrents: TorrentResult[],
  audiobook: AudiobookRequest,
  indexerPriorities?: Map<number, number>,  // indexerId -> priority (1-25)
  flagConfigs?: IndexerFlagConfig[]         // Flag bonus configurations
): RankedTorrent[];
```

## Tech Stack

- string-similarity (fuzzy matching)
- Regex for format detection
