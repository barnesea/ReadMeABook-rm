/**
 * Component: Download Client Manager Service
 * Documentation: documentation/phase3/download-clients.md
 *
 * Manages multiple download clients (qBittorrent, SABnzbd) with protocol-based routing.
 * Supports migration from legacy single-client config to multi-client JSON array format.
 */

import { randomUUID } from 'crypto';
import { ConfigurationService } from './config.service';
import { getEncryptionService } from './encryption.service';
import { isEncryptedFormat } from './credential-migration.service';
import { RMABLogger } from '@/lib/utils/logger';
import { QBittorrentService } from '@/lib/integrations/qbittorrent.service';
import { SABnzbdService } from '@/lib/integrations/sabnzbd.service';
import { PathMappingConfig } from '@/lib/utils/path-mapper';

const logger = RMABLogger.create('DownloadClientManager');

export interface DownloadClientConfig {
  id: string;
  type: 'qbittorrent' | 'sabnzbd';
  name: string;
  enabled: boolean;
  url: string;
  username?: string; // qBittorrent only
  password: string; // Password (qBittorrent) or API key (SABnzbd)
  disableSSLVerify: boolean;
  remotePathMappingEnabled: boolean;
  remotePath?: string;
  localPath?: string;
  category?: string; // Default: 'readmeabook'
}

type ProtocolType = 'torrent' | 'usenet';

/**
 * Download Client Manager
 *
 * Provides centralized management of multiple download clients with:
 * - Protocol-based routing (torrent → qBittorrent, usenet → SABnzbd)
 * - Auto-migration from legacy single-client config
 * - Singleton caching with invalidation
 * - Connection testing
 */
export class DownloadClientManager {
  private static instance: DownloadClientManager | null = null;
  private configService: ConfigurationService;
  private clientsCache: DownloadClientConfig[] | null = null;
  private migrationPerformed = false;

  private constructor(configService: ConfigurationService) {
    this.configService = configService;
  }

  static getInstance(configService?: ConfigurationService): DownloadClientManager {
    if (!DownloadClientManager.instance) {
      if (!configService) {
        throw new Error('ConfigurationService required for first initialization');
      }
      DownloadClientManager.instance = new DownloadClientManager(configService);
    }
    return DownloadClientManager.instance;
  }

  /**
   * Invalidate cached clients (call after config changes)
   */
  static invalidate(): void {
    if (DownloadClientManager.instance) {
      DownloadClientManager.instance.clientsCache = null;
      DownloadClientManager.instance.migrationPerformed = false;
      logger.debug('Download client cache invalidated');
    }
  }

  /**
   * Get all configured download clients
   */
  async getAllClients(): Promise<DownloadClientConfig[]> {
    if (this.clientsCache) {
      return this.clientsCache;
    }

    // Read from database
    const configValue = await this.configService.get('download_clients');

    if (configValue) {
      try {
        const clients = JSON.parse(configValue) as DownloadClientConfig[];

        // Decrypt passwords if they're in encrypted format
        const encryptionService = getEncryptionService();
        const decryptedClients = clients.map(client => {
          if (client.password && isEncryptedFormat(client.password)) {
            try {
              return {
                ...client,
                password: encryptionService.decrypt(client.password),
              };
            } catch (error) {
              logger.error(`Failed to decrypt password for client ${client.name}`, { error });
              return client;
            }
          }
          return client;
        });

        this.clientsCache = decryptedClients;
        return decryptedClients;
      } catch (error) {
        logger.error('Failed to parse download_clients config', { error });
        return [];
      }
    }

    // Check for legacy config and migrate
    if (!this.migrationPerformed) {
      const migrated = await this.migrateLegacyConfig();
      this.migrationPerformed = true;
      if (migrated) {
        return this.getAllClients(); // Recursive call after migration
      }
    }

    return [];
  }

  /**
   * Get client for specific protocol
   */
  async getClientForProtocol(protocol: ProtocolType): Promise<DownloadClientConfig | null> {
    const clients = await this.getAllClients();
    const targetType = protocol === 'torrent' ? 'qbittorrent' : 'sabnzbd';

    const client = clients.find(c => c.enabled && c.type === targetType);

    if (!client) {
      logger.warn(`No enabled ${targetType} client configured`);
      return null;
    }

    return client;
  }

  /**
   * Check if protocol is configured
   */
  async hasClientForProtocol(protocol: ProtocolType): Promise<boolean> {
    const client = await this.getClientForProtocol(protocol);
    return client !== null;
  }

  /**
   * Get instantiated client service for protocol
   */
  async getClientServiceForProtocol(protocol: ProtocolType): Promise<QBittorrentService | SABnzbdService | null> {
    const client = await this.getClientForProtocol(protocol);

    if (!client) {
      return null;
    }

    if (client.type === 'qbittorrent') {
      return this.createQBittorrentService(client);
    } else {
      return this.createSABnzbdService(client);
    }
  }

  /**
   * Test connection for a specific client config
   */
  async testConnection(config: DownloadClientConfig): Promise<{ success: boolean; message: string }> {
    try {
      if (config.type === 'qbittorrent') {
        const service = this.createQBittorrentService(config);
        await service.testConnection();
        return { success: true, message: 'Successfully connected to qBittorrent' };
      } else {
        const service = this.createSABnzbdService(config);
        const version = await service.getVersion();
        return { success: true, message: `Successfully connected to SABnzbd (v${version})` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Connection test failed', { type: config.type, error: message });
      return { success: false, message };
    }
  }

  /**
   * Create qBittorrent service instance
   */
  private createQBittorrentService(config: DownloadClientConfig): QBittorrentService {
    const pathMapping: PathMappingConfig | undefined = config.remotePathMappingEnabled && config.remotePath && config.localPath
      ? {
          enabled: true,
          remotePath: config.remotePath,
          localPath: config.localPath,
        }
      : undefined;

    return new QBittorrentService(
      config.url,
      config.username || '',
      config.password || '', // Optional for IP whitelist auth
      '/downloads', // defaultSavePath
      config.category || 'readmeabook', // defaultCategory
      config.disableSSLVerify,
      pathMapping
    );
  }

  /**
   * Create SABnzbd service instance
   */
  private createSABnzbdService(config: DownloadClientConfig): SABnzbdService {
    const pathMapping: PathMappingConfig | undefined = config.remotePathMappingEnabled && config.remotePath && config.localPath
      ? {
          enabled: true,
          remotePath: config.remotePath,
          localPath: config.localPath,
        }
      : undefined;

    return new SABnzbdService(
      config.url,
      config.password, // API key stored in password field
      config.category || 'readmeabook', // defaultCategory
      '/downloads', // defaultDownloadDir (will be overridden by singleton with actual config)
      config.disableSSLVerify,
      pathMapping
    );
  }

  /**
   * Migrate legacy single-client config to new multi-client format
   */
  private async migrateLegacyConfig(): Promise<boolean> {
    logger.info('Checking for legacy download client config...');

    const [
      clientType,
      clientUrl,
      clientUsername,
      clientPassword,
      disableSSLVerify,
      remotePathMappingEnabled,
      remotePath,
      localPath,
      category,
    ] = await Promise.all([
      this.configService.get('download_client_type'),
      this.configService.get('download_client_url'),
      this.configService.get('download_client_username'),
      this.configService.get('download_client_password'),
      this.configService.get('download_client_disable_ssl_verify'),
      this.configService.get('download_client_remote_path_mapping_enabled'),
      this.configService.get('download_client_remote_path'),
      this.configService.get('download_client_local_path'),
      this.configService.get('sabnzbd_category'),
    ]);

    // Check if legacy config exists
    if (!clientType || !clientUrl || !clientPassword) {
      logger.info('No legacy config found');
      return false;
    }

    logger.info(`Migrating legacy ${clientType} config...`);

    const newClient: DownloadClientConfig = {
      id: randomUUID(),
      type: clientType as 'qbittorrent' | 'sabnzbd',
      name: clientType === 'qbittorrent' ? 'qBittorrent' : 'SABnzbd',
      enabled: true,
      url: clientUrl,
      username: clientUsername || undefined,
      password: clientPassword,
      disableSSLVerify: disableSSLVerify === 'true',
      remotePathMappingEnabled: remotePathMappingEnabled === 'true',
      remotePath: remotePath || undefined,
      localPath: localPath || undefined,
      category: category || 'readmeabook',
    };

    // Save to new format
    const newConfig = [newClient];
    await this.configService.setMany([
      { key: 'download_clients', value: JSON.stringify(newConfig) },
    ]);

    logger.info('Migration completed successfully', {
      type: newClient.type,
      name: newClient.name,
      id: newClient.id
    });

    // Update cache
    this.clientsCache = newConfig;

    return true;
  }
}

/**
 * Get or create singleton instance
 */
export function getDownloadClientManager(configService?: ConfigurationService): DownloadClientManager {
  return DownloadClientManager.getInstance(configService);
}

/**
 * Invalidate singleton (call after config changes)
 */
export function invalidateDownloadClientManager(): void {
  DownloadClientManager.invalidate();
}
