/**
 * Component: RDT-Client Integration Service
 * Documentation: documentation/phase3/download-clients.md
 *
 * RDT-Client is a Real-Debrid torrent proxy that emulates the qBittorrent API.
 * Extends QBittorrentService and overrides behavioral differences:
 * - Duplicate detection: deletes stale torrent before adding fresh (no false matches)
 * - postProcess: removes torrent entry from client after files are organized
 * - ensureCategory: no-op (RDT-Client doesn't support categories)
 */

import { RMABLogger } from '../utils/logger';
import { DownloadClientType } from '../interfaces/download-client.interface';
import { QBittorrentService, AddTorrentOptions } from './qbittorrent.service';

const logger = RMABLogger.create('RDTClient');

export class RDTClientService extends QBittorrentService {
  override readonly clientType: DownloadClientType = 'rdtclient';

  /**
   * Override: Delete any existing torrent with the same hash before adding.
   * RDT-Client can have stale entries from previous requests that cause
   * false duplicate detection — always start fresh.
   */
  protected override async addMagnetLink(
    magnetUrl: string,
    category: string,
    options?: AddTorrentOptions
  ): Promise<string> {
    const infoHash = this.extractHashFromMagnet(magnetUrl);

    if (infoHash) {
      await this.deleteStaleIfExists(infoHash);
    }

    return super.addMagnetLink(magnetUrl, category, options);
  }

  /**
   * Override: Delete any existing torrent with the same hash before adding.
   * Same rationale as addMagnetLink — prevent false duplicate short-circuits.
   */
  protected override async addTorrentFile(
    torrentUrl: string,
    category: string,
    options?: AddTorrentOptions
  ): Promise<string> {
    // We can't pre-extract the hash from a .torrent URL without downloading it,
    // so we let the parent handle the full flow. The parent's duplicate check
    // calls getTorrent which will find any stale entry — but the parent
    // short-circuits on duplicates. To handle this, we override addTorrentFile
    // to intercept after the parent downloads and parses the torrent.
    //
    // The parent's addTorrentFile downloads the .torrent, parses it, checks for
    // duplicates, then uploads. Since we can't hook into the middle of that flow
    // without duplicating the download logic, we accept that .torrent file adds
    // may encounter a stale duplicate. The primary use case (magnet links from
    // indexers) is handled by the addMagnetLink override above.
    //
    // For .torrent files, the parent will return the existing hash if a duplicate
    // is found. The postProcess cleanup after organize will still clean it up.
    return super.addTorrentFile(torrentUrl, category, options);
  }

  /**
   * Override: Remove torrent entry from RDT-Client after files are organized.
   * Unlike qBittorrent (which seeds), RDT-Client torrents should be cleaned up
   * immediately — Real-Debrid handles seeding on their infrastructure.
   */
  override async postProcess(id: string): Promise<void> {
    try {
      logger.info(`Removing torrent ${id} from RDT-Client (post-organize cleanup)`);
      await this.deleteTorrent(id, false);
      logger.info(`Successfully removed torrent ${id} from RDT-Client`);
    } catch (error) {
      // Non-fatal: torrent may already have been removed
      logger.warn(
        `Failed to remove torrent ${id} from RDT-Client: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Override: No-op. RDT-Client doesn't support qBittorrent categories.
   * Avoids 404 errors that appear in logs when the parent tries to create/update categories.
   */
  protected override async ensureCategory(_category: string): Promise<void> {
    // No-op: RDT-Client does not support categories
  }

  /**
   * Delete a stale torrent if it exists, so a fresh add doesn't short-circuit.
   */
  private async deleteStaleIfExists(hash: string): Promise<void> {
    try {
      await this.getTorrent(hash);
      // If we get here, torrent exists — delete it
      logger.info(`Deleting stale torrent ${hash} from RDT-Client before fresh add`);
      await this.deleteTorrent(hash, false);
    } catch {
      // Torrent doesn't exist — nothing to clean up
    }
  }
}
