/**
 * Component: Admin User Request Limit Reset API
 * Documentation: documentation/admin-features/request-limits.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/db';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Admin.Users.ResetLimit');

/**
 * Calculate the time remaining until the request limit resets
 */
function formatTimeUntilReset(resetAt: Date): string {
  const now = new Date().getTime();
  const resetTime = resetAt.getTime();
  const diff = resetTime - now;

  if (diff <= 0) {
    return 'Now';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const { id } = await params;

        // Check if user exists
        const targetUser = await prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            plexUsername: true,
            authProvider: true,
            deletedAt: true,
            requestLimitEnabled: true,
            requestLimitCount: true,
            requestLimitPeriod: true,
          },
        });

        if (!targetUser) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        // Check if user is deleted
        if (targetUser.deletedAt) {
          return NextResponse.json(
            { error: 'Cannot modify a deleted user' },
            { status: 403 }
          );
        }

        // Determine the period to use (per-user or global default)
        const periodDays = targetUser.requestLimitEnabled && targetUser.requestLimitPeriod > 0
          ? targetUser.requestLimitPeriod
          : 7;
        const count = targetUser.requestLimitEnabled && targetUser.requestLimitCount > 0
          ? targetUser.requestLimitCount
          : 5;

        // If limits are disabled or set to 0, return early
        if (!targetUser.requestLimitEnabled || count <= 0 || periodDays <= 0) {
          return NextResponse.json(
            { error: 'Request limits are not enabled for this user' },
            { status: 400 }
          );
        }

        const periodMs = periodDays * 24 * 60 * 60 * 1000;
        const windowStart = new Date(Date.now() - periodMs);

        // Find all requests in the current window
        const requestsInWindow = await prisma.request.findMany({
          where: {
            userId: id,
            createdAt: { gte: windowStart },
            type: 'audiobook',
            deletedAt: null,
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, createdAt: true },
        });

        if (requestsInWindow.length === 0) {
          return NextResponse.json(
            { success: true, message: 'No requests in current window to reset' },
            { status: 200 }
          );
        }

        // Calculate the new window start time by moving it back by the period
        // This effectively resets the limit by moving all requests outside the window
        const newWindowStart = new Date(Date.now() - periodMs * 2);

        // Update all requests in the window to move them outside the window
        await prisma.request.updateMany({
          where: {
            id: { in: requestsInWindow.map((r) => r.id) },
          },
          data: {
            createdAt: newWindowStart,
          },
        });

        logger.info('Request limit reset completed', {
          userId: id,
          username: targetUser.plexUsername,
          requestsReset: requestsInWindow.length,
          windowStart: newWindowStart.toISOString(),
        });

        return NextResponse.json(
          { 
            success: true, 
            message: `Request limit reset. ${requestsInWindow.length} request(s) moved outside the window.`,
          },
          { status: 200 }
        );
      } catch (error) {
        logger.error('Failed to reset request limit', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
          { error: 'Failed to reset request limit' },
          { status: 500 }
        );
      }
    });
  });
}