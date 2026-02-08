/**
 * Component: Audiobook Versions API Route
 * Documentation: plans/narrator-version-search.md
 *
 * Search for all narrator versions of an audiobook
 * Uses both Audible scraping and Audnexus API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAudibleService } from '@/lib/integrations/audible.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Audiobooks.Versions');

/**
 * GET /api/audiobooks/[asin]/versions
 * Search for all narrator versions of an audiobook
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    const { asin } = await params;

    if (!asin || asin.length !== 10) {
      return NextResponse.json(
        {
          error: 'ValidationError',
          message: 'Valid ASIN is required',
        },
        { status: 400 }
      );
    }

    const audibleService = getAudibleService();
    
    // First, get the main book details from Audnexus
    logger.info(`Fetching main details for ASIN ${asin}...`);
    const mainBook = await audibleService.getAudiobookDetails(asin);
    
    if (!mainBook) {
      return NextResponse.json(
        {
          error: 'NotFound',
          message: 'Audiobook not found',
        },
        { status: 404 }
      );
    }

    logger.info(`Main book: "${mainBook.title}" by ${mainBook.author}`);

    // Search Audible for all versions of this title
    logger.info(`Searching Audible for all versions of "${mainBook.title}"...`);
    const searchResults = await audibleService.search(mainBook.title);
    
    // Collect unique versions by narrator
    const versionsMap = new Map<string, {
      asin: string;
      title: string;
      author: string;
      narrator: string;
      coverArtUrl?: string;
      durationMinutes?: number;
    }>();

    // Add the main book first
    if (mainBook.narrator) {
      const narratorKey = mainBook.narrator.toLowerCase().trim();
      versionsMap.set(narratorKey, {
        asin: mainBook.asin,
        title: mainBook.title || '',
        author: mainBook.author || '',
        narrator: mainBook.narrator,
        coverArtUrl: mainBook.coverArtUrl,
        durationMinutes: mainBook.durationMinutes,
      });
    }

    // Process search results to find all unique narrators
    for (const book of searchResults.results) {
      if (!book.narrator) continue;
      
      const narratorKey = book.narrator.toLowerCase().trim();
      
      // Only add if we don't have this narrator yet
      if (!versionsMap.has(narratorKey)) {
        versionsMap.set(narratorKey, {
          asin: book.asin,
          title: book.title || '',
          author: book.author || '',
          narrator: book.narrator,
          coverArtUrl: book.coverArtUrl,
          durationMinutes: book.durationMinutes,
        });
        logger.debug(`Found version: "${book.title}" narrated by ${book.narrator} (ASIN: ${book.asin})`);
      }
    }

    const versions = Array.from(versionsMap.values());
    
    logger.info(`Found ${versions.length} unique narrator versions total`);

    return NextResponse.json({
      success: true,
      baseTitle: mainBook.title,
      baseAuthor: mainBook.author,
      versions,
    });
  } catch (error) {
    logger.error('Failed to search for versions', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: 'SearchError',
        message: 'Failed to search for audiobook versions',
      },
      { status: 500 }
    );
  }
}