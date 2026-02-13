/**
 * Component: Notification Providers Metadata API
 * Documentation: documentation/backend/services/notifications.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getAllProviderMetadata } from '@/lib/services/notification';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Admin.Notifications.Providers');

/**
 * GET /api/admin/notifications/providers
 * Returns metadata for all registered notification providers
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const providers = getAllProviderMetadata();

        return NextResponse.json({
          success: true,
          providers,
        });
      } catch (error) {
        logger.error('Failed to fetch provider metadata', {
          error: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
          {
            error: 'FetchError',
            message: 'Failed to fetch provider metadata',
          },
          { status: 500 }
        );
      }
    });
  });
}
