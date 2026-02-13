/**
 * Component: Admin Reported Issues List API
 * Documentation: documentation/backend/services/reported-issues.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getOpenIssues } from '@/lib/services/reported-issue.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Admin.ReportedIssues');

/**
 * GET /api/admin/reported-issues
 * Get all open reported issues with audiobook metadata and reporter info
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const issues = await getOpenIssues();

        return NextResponse.json({
          success: true,
          issues,
          count: issues.length,
        });
      } catch (error) {
        logger.error('Failed to fetch reported issues', {
          error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
          { error: 'ServerError', message: 'Failed to fetch reported issues' },
          { status: 500 }
        );
      }
    });
  });
}
