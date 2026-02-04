/**
 * Component: Plex Home Users API
 * Documentation: documentation/backend/services/auth.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlexService } from '@/lib/integrations/plex.service';
import { getAuthTokenCache } from '@/lib/services/auth-token-cache.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Auth.Plex.HomeUsers');

/**
 * GET /api/auth/plex/home-users
 * Get list of Plex Home profiles for authenticated user
 *
 * Authentication: Provide X-Plex-Pin-Id header with the PIN ID from OAuth flow.
 * The Plex token is retrieved from server-side cache for security.
 */
export async function GET(request: NextRequest) {
  try {
    // Get pinId from header - token is stored server-side for security
    const pinId = request.headers.get('X-Plex-Pin-Id');

    if (!pinId) {
      logger.warn('Missing X-Plex-Pin-Id header');
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Missing PIN ID. Please restart the login process.',
        },
        { status: 401 }
      );
    }

    // Retrieve the Plex token from server-side cache
    const tokenCache = getAuthTokenCache();
    const authToken = tokenCache.get(pinId);

    if (!authToken) {
      logger.warn('Token not found or expired for pinId', { pinId });
      return NextResponse.json(
        {
          error: 'SessionExpired',
          message: 'Your session has expired. Please restart the login process.',
        },
        { status: 401 }
      );
    }

    const plexService = getPlexService();
    const users = await plexService.getHomeUsers(authToken);

    logger.debug('Home users retrieved', { pinId, userCount: users.length });

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    logger.error('Failed to get home users', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: 'ServerError',
        message: 'Failed to fetch home users',
      },
      { status: 500 }
    );
  }
}
