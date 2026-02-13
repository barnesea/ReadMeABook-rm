/**
 * Component: Goodreads Shelf Delete Route
 * Documentation: documentation/backend/services/goodreads-sync.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthenticatedRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/db';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.GoodreadsShelves');

/**
 * DELETE /api/user/goodreads-shelves/[id]
 * Remove a Goodreads shelf subscription (ownership check)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    try {
      if (!req.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { id } = await params;

      const shelf = await prisma.goodreadsShelf.findUnique({
        where: { id },
      });

      if (!shelf) {
        return NextResponse.json({ error: 'Shelf not found' }, { status: 404 });
      }

      // Ownership check
      if (shelf.userId !== req.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      await prisma.goodreadsShelf.delete({ where: { id } });

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete shelf', { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: 'Failed to delete shelf' }, { status: 500 });
    }
  });
}
