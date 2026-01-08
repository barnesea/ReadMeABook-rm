/**
 * Component: Intelligent Ranking Algorithm
 * Documentation: documentation/phase3/ranking-algorithm.md
 */

import { compareTwoStrings } from 'string-similarity';

export interface TorrentResult {
  indexer: string;
  indexerId?: number;
  title: string;
  size: number;
  seeders?: number;     // Optional for NZB/Usenet results (no seeders concept)
  leechers?: number;    // Optional for NZB/Usenet results (no leechers concept)
  publishDate: Date;
  downloadUrl: string;
  infoUrl?: string;     // Link to indexer's info page (for user reference)
  infoHash?: string;
  guid: string;
  format?: 'M4B' | 'M4A' | 'MP3' | 'OTHER';
  bitrate?: string;
  hasChapters?: boolean;
  flags?: string[];     // Indexer flags like "Freeleech", "Internal", etc.
  protocol?: string;    // 'torrent' or 'usenet' - from Prowlarr API
}

export interface AudiobookRequest {
  title: string;
  author: string;
  narrator?: string;
  durationMinutes?: number;
}

export interface IndexerFlagConfig {
  name: string;         // Flag name (e.g., "Freeleech")
  modifier: number;     // -100 to 100 (percentage)
}

export interface BonusModifier {
  type: 'indexer_priority' | 'indexer_flag' | 'custom';
  value: number;        // Multiplier (e.g., 0.4 for 40%)
  points: number;       // Calculated bonus points from this modifier
  reason: string;       // Human-readable explanation
}

export interface ScoreBreakdown {
  formatScore: number;
  seederScore: number;
  matchScore: number;
  totalScore: number;
  notes: string[];
}

export interface RankedTorrent extends TorrentResult {
  score: number;              // Base score (0-100)
  bonusModifiers: BonusModifier[];
  bonusPoints: number;        // Sum of all bonus points
  finalScore: number;         // score + bonusPoints
  rank: number;
  breakdown: ScoreBreakdown;
}

export class RankingAlgorithm {
  /**
   * Rank all torrents and return sorted by finalScore (best first)
   * @param torrents - Array of torrent results to rank
   * @param audiobook - Audiobook request details for matching
   * @param indexerPriorities - Optional map of indexerId to priority (1-25), defaults to 10
   * @param flagConfigs - Optional array of flag configurations for bonus/penalty modifiers
   */
  rankTorrents(
    torrents: TorrentResult[],
    audiobook: AudiobookRequest,
    indexerPriorities?: Map<number, number>,
    flagConfigs?: IndexerFlagConfig[]
  ): RankedTorrent[] {
    const ranked = torrents.map((torrent) => {
      // Calculate base scores (0-100)
      const formatScore = this.scoreFormat(torrent);
      const seederScore = this.scoreSeeders(torrent.seeders);
      const matchScore = this.scoreMatch(torrent, audiobook);

      const baseScore = formatScore + seederScore + matchScore;

      // Calculate bonus modifiers
      const bonusModifiers: BonusModifier[] = [];

      // Indexer priority bonus (default: 10/25 = 40%)
      if (torrent.indexerId !== undefined) {
        const priority = indexerPriorities?.get(torrent.indexerId) ?? 10;
        const modifier = priority / 25;  // Convert 1-25 to 0.04-1.0 (4%-100%)
        const points = baseScore * modifier;

        bonusModifiers.push({
          type: 'indexer_priority',
          value: modifier,
          points: points,
          reason: `Indexer priority ${priority}/25 (${Math.round(modifier * 100)}%)`,
        });
      }

      // Flag bonuses/penalties
      if (torrent.flags && torrent.flags.length > 0 && flagConfigs && flagConfigs.length > 0) {
        torrent.flags.forEach(torrentFlag => {
          // Case-insensitive, whitespace-trimmed matching
          const matchingConfig = flagConfigs.find(cfg =>
            cfg.name.trim().toLowerCase() === torrentFlag.trim().toLowerCase()
          );

          if (matchingConfig) {
            const modifier = matchingConfig.modifier / 100; // Convert -100 to 100 → -1.0 to 1.0
            const points = baseScore * modifier;

            bonusModifiers.push({
              type: 'indexer_flag',
              value: modifier,
              points: points,
              reason: `Flag "${torrentFlag}" (${matchingConfig.modifier > 0 ? '+' : ''}${matchingConfig.modifier}%)`,
            });
          }
        });
      }

      // Sum all bonus points
      const bonusPoints = bonusModifiers.reduce((sum, mod) => sum + mod.points, 0);

      // Calculate final score
      const finalScore = baseScore + bonusPoints;

      return {
        ...torrent,
        score: baseScore,
        bonusModifiers,
        bonusPoints,
        finalScore,
        rank: 0, // Will be assigned after sorting
        breakdown: {
          formatScore,
          seederScore,
          matchScore,
          totalScore: baseScore,
          notes: this.generateNotes(torrent, {
            formatScore,
            seederScore,
            matchScore,
            totalScore: baseScore,
            notes: [],
          }),
        },
      };
    });

    // Sort by finalScore descending (best first), then by publishDate descending (newest first) for tiebreakers
    ranked.sort((a, b) => {
      // Primary: sort by final score
      if (b.finalScore !== a.finalScore) {
        return b.finalScore - a.finalScore;
      }
      // Tiebreaker: sort by publishDate (newest first)
      return b.publishDate.getTime() - a.publishDate.getTime();
    });

    // Assign ranks
    ranked.forEach((r, index) => {
      r.rank = index + 1;
    });

    return ranked;
  }

  /**
   * Get detailed scoring breakdown for a torrent
   */
  getScoreBreakdown(
    torrent: TorrentResult,
    audiobook: AudiobookRequest
  ): ScoreBreakdown {
    const formatScore = this.scoreFormat(torrent);
    const seederScore = this.scoreSeeders(torrent.seeders);
    const matchScore = this.scoreMatch(torrent, audiobook);
    const totalScore = formatScore + seederScore + matchScore;

    return {
      formatScore,
      seederScore,
      matchScore,
      totalScore,
      notes: this.generateNotes(torrent, {
        formatScore,
        seederScore,
        matchScore,
        totalScore,
        notes: [],
      }),
    };
  }

  /**
   * Score format quality (25 points max)
   * M4B with chapters: 25 pts
   * M4B without chapters: 22 pts
   * M4A: 16 pts
   * MP3: 10 pts
   * Other: 3 pts
   */
  private scoreFormat(torrent: TorrentResult): number {
    const format = this.detectFormat(torrent);

    switch (format) {
      case 'M4B':
        return torrent.hasChapters !== false ? 25 : 22;
      case 'M4A':
        return 16;
      case 'MP3':
        return 10;
      default:
        return 3;
    }
  }

  /**
   * Score seeder count (15 points max)
   * Logarithmic scaling:
   * 1 seeder: 0 points
   * 10 seeders: 6 points
   * 100 seeders: 12 points
   * 1000+ seeders: 15 points
   *
   * Note: NZB/Usenet results don't have seeders concept - centralized servers provide guaranteed availability
   */
  private scoreSeeders(seeders: number | undefined): number {
    // Handle undefined/null (NZB results) - give full score since Usenet has centralized availability
    if (seeders === undefined || seeders === null || isNaN(seeders)) {
      return 15; // Full score - Usenet doesn't need seeders, content is on centralized servers
    }

    if (seeders === 0) return 0;
    return Math.min(15, Math.log10(seeders + 1) * 6);
  }


  /**
   * Score title/author match quality (60 points max)
   * Title similarity: 0-45 points (heavily weighted!)
   * Author presence: 0-15 points
   */
  private scoreMatch(
    torrent: TorrentResult,
    audiobook: AudiobookRequest
  ): number {
    // Normalize whitespace (multiple spaces → single space) for consistent matching
    const torrentTitle = torrent.title.toLowerCase().replace(/\s+/g, ' ').trim();
    const requestTitle = audiobook.title.toLowerCase().replace(/\s+/g, ' ').trim();
    const requestAuthor = audiobook.author.toLowerCase().replace(/\s+/g, ' ').trim();

    // ========== STAGE 1: WORD COVERAGE FILTER (MANDATORY) ==========
    // Extract significant words (filter out common stop words)
    const stopWords = ['the', 'a', 'an', 'of', 'on', 'in', 'at', 'by', 'for'];

    const extractWords = (text: string, stopList: string[]): string[] => {
      return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 0 && !stopList.includes(word));
    };

    // Separate required words (outside parentheses/brackets) from optional words (inside)
    // This handles common patterns like "Title (Subtitle)" where subtitle may be omitted
    const separateRequiredOptional = (title: string): { required: string; optional: string } => {
      // Extract content in parentheses/brackets as optional
      const optionalPattern = /[(\[{]([^)\]}]+)[)\]}]/g;
      const optionalMatches: string[] = [];
      let match;

      while ((match = optionalPattern.exec(title)) !== null) {
        optionalMatches.push(match[1]);
      }

      // Remove parenthetical/bracketed content to get required portion
      const required = title.replace(/[(\[{][^)\]}]+[)\]}]/g, ' ').trim();
      const optional = optionalMatches.join(' ');

      return { required, optional };
    };

    const { required: requiredTitle, optional: optionalTitle } = separateRequiredOptional(requestTitle);

    // Extract words from required portion only for coverage check
    const requiredWords = extractWords(requiredTitle, stopWords);
    const torrentWords = extractWords(torrentTitle, stopWords);

    // Calculate word coverage: how many REQUIRED words appear in TORRENT
    if (requiredWords.length === 0) {
      // Edge case: title is only stop words or only optional content, skip filter
      // Fall through to normal scoring
    } else {
      const matchedWords = requiredWords.filter(word => torrentWords.includes(word));
      const coverage = matchedWords.length / requiredWords.length;

      // HARD REQUIREMENT: Must have 80%+ coverage of REQUIRED words
      if (coverage < 0.80) {
        // Automatic rejection - doesn't contain enough of the requested words
        return 0;
      }
    }

    // ========== STAGE 2: TITLE MATCHING (0-35 points) ==========
    let titleScore = 0;

    // Try matching with full title first, then fall back to required title (without parentheses)
    const titlesToTry = [requestTitle];
    if (requiredTitle !== requestTitle) {
      titlesToTry.push(requiredTitle); // Add required-only version if different
    }

    let bestMatch = false;
    for (const titleToMatch of titlesToTry) {
      if (torrentTitle.includes(titleToMatch)) {
        // Found the title, but is it the complete title or part of a longer one?
        const titleIndex = torrentTitle.indexOf(titleToMatch);
        const beforeTitle = torrentTitle.substring(0, titleIndex);
        const afterTitle = torrentTitle.substring(titleIndex + titleToMatch.length);

        // Extract significant words BEFORE the matched title
        const beforeWords = extractWords(beforeTitle, stopWords);

        // Title is complete if:
        // 1. Acceptable prefix (no words, OR structured metadata like "Author - Series - ")
        // 2. Followed by clear metadata markers (not "'s Secret" or " Is Watching")
        const metadataMarkers = [' by ', ' - ', ' [', ' (', ' {', ' :', ','];

        // Check if afterTitle starts with author name (handles space-separated format like "Title Author Year")
        const afterStartsWithAuthor = requestAuthor.length > 2 &&
          afterTitle.trim().startsWith(requestAuthor);

        const hasMetadataSuffix = afterTitle === '' ||
                                  metadataMarkers.some(marker => afterTitle.startsWith(marker)) ||
                                  afterStartsWithAuthor;

        // Check prefix validity:
        // - No words before = clean match
        // - Title preceded by separator (` - `, `: `) = structured metadata (Author - Series - Title)
        // - Author name in prefix = author attribution before title
        const hasNoWordsPrefix = beforeWords.length === 0;

        // Check if title is immediately preceded by a metadata separator
        // This handles "Author - Series - 01 - Title" patterns
        const precedingText = beforeTitle.trimEnd();
        const titlePrecededBySeparator =
          precedingText.endsWith('-') ||
          precedingText.endsWith(':') ||
          precedingText.endsWith('—');

        // Check if author name appears in the prefix
        // This handles "Author Name - Title" patterns
        const authorInPrefix = requestAuthor.length > 2 &&
          beforeTitle.includes(requestAuthor);

        const hasAcceptablePrefix =
          hasNoWordsPrefix ||
          titlePrecededBySeparator ||
          authorInPrefix;

        const isCompleteTitle = hasAcceptablePrefix && hasMetadataSuffix;

        if (isCompleteTitle) {
          // Complete title match → full points
          titleScore = 45;
          bestMatch = true;
          break; // Found a good match, stop trying
        }
      }
    }

    if (!bestMatch) {
      // No complete match found, use fuzzy similarity as fallback
      // Try against full title first, then required title
      const fuzzyScores = titlesToTry.map(title => compareTwoStrings(title, torrentTitle));
      titleScore = Math.max(...fuzzyScores) * 45;
    }

    // ========== STAGE 3: AUTHOR MATCHING (0-15 points) ==========
    // Parse requested authors (split on separators, filter out roles)
    const requestAuthors = requestAuthor
      .split(/,|&| and | - /)
      .map(a => a.trim())
      .filter(a => a.length > 2 && !['translator', 'narrator'].includes(a));

    // Check how many authors appear in torrent title (exact substring match)
    const authorMatches = requestAuthors.filter(author =>
      torrentTitle.includes(author)
    );

    let authorScore = 0;
    if (authorMatches.length > 0) {
      // Exact substring match → proportional credit
      authorScore = (authorMatches.length / requestAuthors.length) * 15;
    } else {
      // No exact match → use fuzzy similarity for partial credit
      authorScore = compareTwoStrings(requestAuthor, torrentTitle) * 15;
    }

    return Math.min(60, titleScore + authorScore);
  }

  /**
   * Detect format from torrent title
   */
  private detectFormat(torrent: TorrentResult): 'M4B' | 'M4A' | 'MP3' | 'OTHER' {
    // Use explicit format if provided
    if (torrent.format) {
      return torrent.format;
    }

    const title = torrent.title.toUpperCase();

    // Check for format keywords in title
    if (title.includes('M4B')) return 'M4B';
    if (title.includes('M4A')) return 'M4A';
    if (title.includes('MP3')) return 'MP3';

    // Default to OTHER if no format detected
    return 'OTHER';
  }

  /**
   * Generate human-readable notes about scoring
   */
  private generateNotes(
    torrent: TorrentResult,
    breakdown: ScoreBreakdown
  ): string[] {
    const notes: string[] = [];

    // Format notes
    const format = this.detectFormat(torrent);
    if (format === 'M4B') {
      notes.push('Excellent format (M4B)');
      if (torrent.hasChapters !== false) {
        notes.push('Has chapter markers');
      }
    } else if (format === 'M4A') {
      notes.push('Good format (M4A)');
    } else if (format === 'MP3') {
      notes.push('Acceptable format (MP3)');
    } else {
      notes.push('Unknown or uncommon format');
    }

    // Seeder notes (skip for NZB/Usenet results which don't have seeders)
    if (torrent.seeders !== undefined && torrent.seeders !== null && !isNaN(torrent.seeders)) {
      if (torrent.seeders === 0) {
        notes.push('⚠️ No seeders available');
      } else if (torrent.seeders < 5) {
        notes.push(`Low seeders (${torrent.seeders})`);
      } else if (torrent.seeders >= 50) {
        notes.push(`Excellent availability (${torrent.seeders} seeders)`);
      }
    }

    // Match notes (now worth 60 points!)
    if (breakdown.matchScore < 24) {
      notes.push('⚠️ Poor title/author match');
    } else if (breakdown.matchScore < 42) {
      notes.push('⚠️ Weak title/author match');
    } else if (breakdown.matchScore >= 54) {
      notes.push('✓ Excellent title/author match');
    }

    // Overall quality assessment
    if (breakdown.totalScore >= 75) {
      notes.push('✓ Excellent choice');
    } else if (breakdown.totalScore >= 55) {
      notes.push('✓ Good choice');
    } else if (breakdown.totalScore < 35) {
      notes.push('⚠️ Consider reviewing this choice');
    }

    return notes;
  }
}

// Singleton instance
let ranker: RankingAlgorithm | null = null;

export function getRankingAlgorithm(): RankingAlgorithm {
  if (!ranker) {
    ranker = new RankingAlgorithm();
  }
  return ranker;
}

/**
 * Helper function to rank torrents using the singleton instance
 */
export function rankTorrents(
  torrents: TorrentResult[],
  audiobook: AudiobookRequest,
  indexerPriorities?: Map<number, number>,
  flagConfigs?: IndexerFlagConfig[]
): (RankedTorrent & { qualityScore: number })[] {
  const algorithm = getRankingAlgorithm();
  const ranked = algorithm.rankTorrents(torrents, audiobook, indexerPriorities, flagConfigs);

  // Add qualityScore field for UI compatibility (rounded score)
  return ranked.map((r) => ({
    ...r,
    qualityScore: Math.round(r.score),
  }));
}
