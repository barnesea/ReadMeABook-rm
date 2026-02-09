/**
 * Component: Library Reorganization API Endpoint
 * Documentation: documentation/admin-features/library-reorganization.md
 *
 * API endpoint to trigger library reorganization job.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getJobQueueService } from '@/lib/services/job-queue.service';
import { getSchedulerService } from '@/lib/services/scheduler.service';
import { getConfigService } from '@/lib/services/config.service';

/**
 * GET /api/admin/library/reorganize/status
 * Get reorganization status and configuration
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const configService = getConfigService();
        const reorgConfig = await configService.getLibraryReorganizationConfig();

        // Get last scheduled job run info
        const schedulerService = getSchedulerService();
        const scheduledJobs = await schedulerService.getScheduledJobs();
        const reorgJob = scheduledJobs.find((j) => j.type === 'reorganize_library');

        return NextResponse.json({
          enabled: reorgConfig.enabled,
          scanIntervalMinutes: reorgConfig.scanIntervalMinutes,
          lastRunAt: reorgJob?.lastRun || null,
        });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to get reorganization status' },
          { status: 500 }
        );
      }
    });
  });
}

/**
 * POST /api/admin/library/reorganize
 * Trigger library reorganization job immediately
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const body = await request.json();
        const { libraryId } = body;

        const jobQueueService = getJobQueueService();
        const jobId = await jobQueueService.addReorganizeLibraryJob(libraryId || undefined);

        return NextResponse.json({
          success: true,
          jobId,
          message: 'Reorganization job queued',
        });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to trigger reorganization' },
          { status: 500 }
        );
      }
    });
  });
}