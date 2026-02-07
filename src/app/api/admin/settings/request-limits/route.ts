/**
 * Component: Request Limits Admin API
 * Documentation: documentation/admin-features/request-limits.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getConfigService } from '@/lib/services/config.service';
import { RMABLogger } from '@/lib/utils/logger';
import { z } from 'zod';

const logger = RMABLogger.create('API.RequestLimits');

const RequestLimitConfigSchema = z.object({
  enabled: z.boolean(),
  count: z.number().int().min(0).max(1000),
  period: z.number().int().min(0).max(365),
});

/**
 * GET /api/admin/settings/request-limits
 * Get server-wide request limit configuration
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    try {
      if (!req.user) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'User not authenticated' },
          { status: 401 }
        );
      }

      // Only admins can access this endpoint
      if (req.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Admin access required' },
          { status: 403 }
        );
      }

      const configService = getConfigService();
      const config = await configService.getRequestLimitConfig();

      return NextResponse.json({
        success: true,
        config,
      });
    } catch (error) {
      logger.error('Failed to get request limit config', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json(
        { error: 'FetchError', message: 'Failed to fetch request limit configuration' },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/admin/settings/request-limits
 * Update server-wide request limit configuration
 */
export async function PUT(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    try {
      if (!req.user) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'User not authenticated' },
          { status: 401 }
        );
      }

      // Only admins can access this endpoint
      if (req.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Admin access required' },
          { status: 403 }
        );
      }

      const body = await req.json();
      const { enabled, count, period } = RequestLimitConfigSchema.parse(body);

      const configService = getConfigService();
      await configService.setRequestLimitConfig(enabled, count, period);

      logger.info('Request limit configuration updated', {
        enabled,
        count,
        period,
        userId: req.user.id,
      });

      return NextResponse.json({
        success: true,
        message: 'Request limit configuration updated successfully',
        config: { enabled, count, period },
      });
    } catch (error) {
      logger.error('Failed to update request limit config', { error: error instanceof Error ? error.message : String(error) });

      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'ValidationError', details: error.errors },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'UpdateError', message: 'Failed to update request limit configuration' },
        { status: 500 }
      );
    }
  });
}