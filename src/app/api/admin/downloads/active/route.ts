/**
 * Component: Admin Active Downloads API
 * Documentation: documentation/admin-dashboard.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/db';
import { getConfigService } from '@/lib/services/config.service';
import { getDownloadClientManager } from '@/lib/services/download-client-manager.service';
import { RMABLogger } from '@/lib/utils/logger';
import { CLIENT_PROTOCOL_MAP, DownloadClientType } from '@/lib/interfaces/download-client.interface';

const logger = RMABLogger.create('API.Admin.Downloads');

export async function GET(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        // Get active downloads with related data (both audiobook and ebook)
    const activeDownloads = await prisma.request.findMany({
      where: {
        status: 'downloading',
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        type: true, // 'audiobook' or 'ebook'
        progress: true,
        updatedAt: true,
        audiobook: {
          select: {
            id: true,
            title: true,
            author: true,
          },
        },
        user: {
          select: {
            id: true,
            plexUsername: true,
          },
        },
        downloadHistory: {
          where: {
            downloadStatus: 'downloading',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            downloadStatus: true,
            torrentName: true,
            torrentHash: true,
            nzbId: true,
            downloadClientId: true,
            downloadClient: true, // qbittorrent, sabnzbd, or direct
            torrentSizeBytes: true,
            startedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 20,
    });

    // Get download client manager
    const configService = getConfigService();
    const manager = getDownloadClientManager(configService);

    // Format response with speed and ETA from download client
    const formatted = await Promise.all(
      activeDownloads.map(async (download) => {
        let speed = 0;
        let eta: number | null = null;

        const downloadHistory = download.downloadHistory[0];
        const downloadClient = downloadHistory?.downloadClient;

        try {
          if (downloadClient === 'direct') {
            // Direct HTTP download (ebooks) - estimate speed from progress and time elapsed
            const startedAt = downloadHistory?.startedAt || downloadHistory?.createdAt;
            const totalSize = downloadHistory?.torrentSizeBytes ? Number(downloadHistory.torrentSizeBytes) : 0;

            if (startedAt && download.progress > 0 && totalSize > 0) {
              const elapsedMs = Date.now() - new Date(startedAt).getTime();
              const elapsedSeconds = elapsedMs / 1000;
              const bytesDownloaded = (download.progress / 100) * totalSize;

              if (elapsedSeconds > 0) {
                speed = Math.round(bytesDownloaded / elapsedSeconds);
                const remainingBytes = totalSize - bytesDownloaded;
                eta = speed > 0 ? Math.round(remainingBytes / speed) : null;
              }
            }
          } else {
            // Use unified interface for all download clients (qBittorrent, SABnzbd, etc.)
            const clientId = downloadHistory?.downloadClientId || downloadHistory?.torrentHash || downloadHistory?.nzbId;
            if (clientId && downloadClient) {
              const protocol = CLIENT_PROTOCOL_MAP[downloadClient as DownloadClientType] || 'torrent';
              const client = await manager.getClientServiceForProtocol(protocol as 'torrent' | 'usenet');

              if (client) {
                const info = await client.getDownload(clientId);
                if (info) {
                  speed = info.downloadSpeed;
                  eta = info.eta > 0 ? info.eta : null;
                }
              }
            }
          }
        } catch (error) {
          // Download client unavailable or download not found - use defaults
          logger.error('Failed to get download info', { error: error instanceof Error ? error.message : String(error) });
        }

        return {
          requestId: download.id,
          title: download.audiobook.title,
          author: download.audiobook.author,
          status: download.status,
          type: download.type, // 'audiobook' or 'ebook'
          progress: download.progress,
          speed,
          eta,
          torrentName: downloadHistory?.torrentName || null,
          downloadStatus: downloadHistory?.downloadStatus || null,
          user: download.user.plexUsername,
          startedAt: downloadHistory?.startedAt || downloadHistory?.createdAt || download.updatedAt,
        };
      })
    );

    return NextResponse.json({ downloads: formatted });
      } catch (error) {
        logger.error('Failed to fetch active downloads', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
          { error: 'Failed to fetch active downloads' },
          { status: 500 }
        );
      }
    });
  });
}
