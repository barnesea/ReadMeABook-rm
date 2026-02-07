/**
 * Component: Request Limit Info API
 * Documentation: documentation/admin-features/request-limits.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticatedRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/db';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Requests.LimitInfo');

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    try {
      if (!req.user) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'User not authenticated' },
          { status: 401 }
        );
      }

      const userId = req.user.id;
      const role = req.user.role;

      // Admin users always have unlimited requests
      if (role === 'admin') {
        return NextResponse.json({
          count: 0,
          periodDays: 0,
          requestsMade: 0,
          resetAt: new Date().toISOString(),
          isUnlimited: true,
        });
      }

      // Get user's request limit settings
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          requestLimitEnabled: true,
          requestLimitCount: true,
          requestLimitPeriod: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'UserNotFound', message: 'User not found' },
          { status: 404 }
        );
      }

      // Determine the period to use
      const periodDays = user.requestLimitEnabled ? user.requestLimitPeriod : 7;
      const count = user.requestLimitEnabled ? user.requestLimitCount : 5;

      // Calculate the reset date based on the period (rolling window)
      // The reset time is calculated from the oldest request in the current period
      const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      
      // Find the oldest request in the current period to calculate reset time
      const oldestRequest = await prisma.request.findFirst({
        where: {
          userId: userId,
          createdAt: { gte: periodStart },
          type: 'audiobook', // Only count audiobook requests
          deletedAt: null, // Exclude soft-deleted requests
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      // Calculate reset time based on the oldest request
      const resetAt = oldestRequest
        ? new Date(oldestRequest.createdAt.getTime() + periodDays * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);

      // Count requests made in the current period
      const requestsMade = await prisma.request.count({
        where: {
          userId: userId,
          createdAt: {
            gte: periodStart,
          },
          type: 'audiobook', // Only count audiobook requests
          deletedAt: null, // Exclude soft-deleted requests
        },
      });

      return NextResponse.json({
        count,
        periodDays,
        requestsMade,
        resetAt: resetAt.toISOString(),
        isUnlimited: false,
      });
    } catch (error) {
      logger.error('Failed to fetch request limit info', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json(
        { error: 'FetchError', message: 'Failed to fetch request limit info' },
        { status: 500 }
      );
    }
  });
}