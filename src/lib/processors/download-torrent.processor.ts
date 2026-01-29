/**
 * Component: Download Job Processor
 * Documentation: documentation/phase3/README.md
 */

import { DownloadTorrentPayload, getJobQueueService } from '../services/job-queue.service';
import { prisma } from '../db';
import { getQBittorrentService } from '../integrations/qbittorrent.service';
import { getSABnzbdService } from '../integrations/sabnzbd.service';
import { getConfigService } from '../services/config.service';
import { getDownloadClientManager } from '../services/download-client-manager.service';
import { ProwlarrService } from '../integrations/prowlarr.service';
import { RMABLogger } from '../utils/logger';

/**
 * Process download job
 * Routes to appropriate download client based on configuration
 * Adds selected result to download client and starts monitoring
 */
export async function processDownloadTorrent(payload: DownloadTorrentPayload): Promise<any> {
  const { requestId, audiobook, torrent, jobId } = payload;

  const logger = RMABLogger.forJob(jobId, 'DownloadTorrent');

  logger.info(`Processing request ${requestId} for "${audiobook.title}"`);
  logger.info(`Selected result: ${torrent.title}`, {
    size: torrent.size,
    seeders: torrent.seeders,
    format: torrent.format,
    indexer: torrent.indexer,
  });

  try {
    // Update request status to downloading
    await prisma.request.update({
      where: { id: requestId },
      data: {
        status: 'downloading',
        progress: 0,
        updatedAt: new Date(),
      },
    });

    // Detect protocol from result and route to appropriate client
    const isUsenet = ProwlarrService.isNZBResult(torrent);
    const config = await getConfigService();
    const manager = getDownloadClientManager(config);

    const clientConfig = await manager.getClientForProtocol(isUsenet ? 'usenet' : 'torrent');

    if (!clientConfig) {
      const protocol = isUsenet ? 'Usenet (SABnzbd)' : 'Torrent (qBittorrent)';
      throw new Error(`No ${protocol} client configured`);
    }

    let downloadClientId: string;
    let downloadClient: 'qbittorrent' | 'sabnzbd';

    if (isUsenet) {
      // Route to SABnzbd
      logger.info(`Routing to SABnzbd`);

      const sabnzbd = await getSABnzbdService();
      downloadClientId = await sabnzbd.addNZB(torrent.downloadUrl, {
        category: clientConfig.category || 'readmeabook',
        priority: 'normal',
      });
      downloadClient = 'sabnzbd';

      logger.info(`NZB added with ID: ${downloadClientId}`);

      // Create DownloadHistory record
      // Determine indexer page URL - exclude magnet links from guid fallback
      const indexerPageUrl = torrent.infoUrl || (torrent.guid?.startsWith('magnet:') ? null : torrent.guid);

      const downloadHistory = await prisma.downloadHistory.create({
        data: {
          requestId,
          indexerName: torrent.indexer,
          indexerId: torrent.indexerId, // Store indexer ID for configuration lookup
          downloadClient: 'sabnzbd',
          downloadClientId,
          torrentName: torrent.title,
          nzbId: downloadClientId, // Store NZB ID
          torrentSizeBytes: torrent.size,
          torrentUrl: indexerPageUrl, // Indexer page URL (only if available and not a magnet/download link)
          magnetLink: torrent.downloadUrl, // Download URL (.nzb file)
          seeders: torrent.seeders || 0, // Usenet doesn't have seeders, but include for consistency
          leechers: 0,
          downloadStatus: 'downloading',
          selected: true,
          startedAt: new Date(),
        },
      });

      logger.info(`Created download history record: ${downloadHistory.id}`);

      // Trigger monitor download job with initial delay
      const jobQueue = getJobQueueService();
      await jobQueue.addMonitorJob(
        requestId,
        downloadHistory.id,
        downloadClientId,
        'sabnzbd',
        3 // Wait 3 seconds before first check
      );

      logger.info(`Started monitoring job for request ${requestId} (SABnzbd, 3s initial delay)`);

      return {
        success: true,
        message: 'NZB added to SABnzbd and monitoring started',
        requestId,
        downloadHistoryId: downloadHistory.id,
        nzbId: downloadClientId,
        torrent: {
          title: torrent.title,
          size: torrent.size,
          format: torrent.format,
        },
      };
    } else {
      // Route to qBittorrent (default)
      logger.info(`Routing to qBittorrent`);

      const qbt = await getQBittorrentService();
      downloadClientId = await qbt.addTorrent(torrent.downloadUrl, {
        category: clientConfig.category || 'readmeabook',
        tags: ['audiobook'],
        sequentialDownload: true,
        paused: false,
      });
      downloadClient = 'qbittorrent';

      logger.info(`Torrent added with hash: ${downloadClientId}`);

      // Create DownloadHistory record
      // Determine indexer page URL - exclude magnet links from guid fallback
      const indexerPageUrl = torrent.infoUrl || (torrent.guid?.startsWith('magnet:') ? null : torrent.guid);

      const downloadHistory = await prisma.downloadHistory.create({
        data: {
          requestId,
          indexerName: torrent.indexer,
          indexerId: torrent.indexerId, // Store indexer ID for configuration lookup
          downloadClient: 'qbittorrent',
          downloadClientId,
          torrentName: torrent.title,
          torrentHash: torrent.infoHash || downloadClientId, // Store torrent hash
          torrentSizeBytes: torrent.size,
          torrentUrl: indexerPageUrl, // Indexer page URL (only if available and not a magnet/download link)
          magnetLink: torrent.downloadUrl,
          seeders: torrent.seeders || 0,
          leechers: torrent.leechers || 0,
          downloadStatus: 'downloading',
          selected: true,
          startedAt: new Date(),
        },
      });

      logger.info(`Created download history record: ${downloadHistory.id}`);

      // Trigger monitor download job with initial delay
      const jobQueue = getJobQueueService();
      await jobQueue.addMonitorJob(
        requestId,
        downloadHistory.id,
        downloadClientId,
        'qbittorrent',
        3 // Wait 3 seconds before first check to avoid race condition
      );

      logger.info(`Started monitoring job for request ${requestId} (qBittorrent, 3s initial delay)`);

      return {
        success: true,
        message: 'Torrent added to qBittorrent and monitoring started',
        requestId,
        downloadHistoryId: downloadHistory.id,
        torrentHash: downloadClientId,
        torrent: {
          title: torrent.title,
          size: torrent.size,
          seeders: torrent.seeders || 0,
          format: torrent.format,
        },
      };
    }
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    // Update request status to failed
    await prisma.request.update({
      where: { id: requestId },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Failed to add download to client',
        updatedAt: new Date(),
      },
    });

    throw error;
  }
}
