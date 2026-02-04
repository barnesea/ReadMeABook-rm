/**
 * Component: Admin Download Clients Management API
 * Documentation: documentation/phase3/download-clients.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getConfigService } from '@/lib/services/config.service';
import { getDownloadClientManager, invalidateDownloadClientManager } from '@/lib/services/download-client-manager.service';
import { DownloadClientConfig } from '@/lib/services/download-client-manager.service';
import { getEncryptionService } from '@/lib/services/encryption.service';
import { RMABLogger } from '@/lib/utils/logger';
import { randomUUID } from 'crypto';

const logger = RMABLogger.create('API.Admin.Settings.DownloadClients');

/**
 * GET - List all configured download clients
 */
export async function GET(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const config = await getConfigService();
        const manager = getDownloadClientManager(config);
        const clients = await manager.getAllClients();

        // Mask passwords in response
        const maskedClients = clients.map(c => ({
          ...c,
          password: c.password ? '********' : '',
        }));

        return NextResponse.json({ clients: maskedClients });
      } catch (error) {
        logger.error('Failed to get download clients', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
          { error: 'Failed to retrieve download clients' },
          { status: 500 }
        );
      }
    });
  });
}

/**
 * POST - Add new download client
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const body = await request.json();
        const {
          type,
          name,
          url,
          username,
          password,
          disableSSLVerify,
          remotePathMappingEnabled,
          remotePath,
          localPath,
          category,
        } = body;

        // Validate type
        if (type !== 'qbittorrent' && type !== 'sabnzbd') {
          return NextResponse.json(
            { error: 'Invalid client type. Must be qbittorrent or sabnzbd' },
            { status: 400 }
          );
        }

        // Validate required fields
        // Name and URL always required; password/API key only required for SABnzbd
        // qBittorrent supports IP whitelist auth (no credentials needed)
        if (!name || !url) {
          return NextResponse.json(
            { error: 'Name and URL are required' },
            { status: 400 }
          );
        }

        if (type === 'sabnzbd' && !password) {
          return NextResponse.json(
            { error: 'API key is required for SABnzbd' },
            { status: 400 }
          );
        }

        // Validate path mapping if enabled
        if (remotePathMappingEnabled) {
          if (!remotePath || !localPath) {
            return NextResponse.json(
              { error: 'Remote path and local path are required when path mapping is enabled' },
              { status: 400 }
            );
          }
        }

        // Check for duplicate type (only one client per type for now)
        const config = await getConfigService();
        const manager = getDownloadClientManager(config);
        const existingClients = await manager.getAllClients();

        const duplicateType = existingClients.find(c => c.type === type && c.enabled);
        if (duplicateType) {
          return NextResponse.json(
            { error: `A ${type} client is already configured. Please disable or remove it first.` },
            { status: 400 }
          );
        }

        // Create new client config for testing (with plaintext password)
        // qBittorrent credentials are optional (supports IP whitelist auth)
        const newClient: DownloadClientConfig = {
          id: randomUUID(),
          type,
          name,
          enabled: true,
          url,
          username: username || '',
          password: password || '', // Plaintext for connection test
          disableSSLVerify: disableSSLVerify || false,
          remotePathMappingEnabled: remotePathMappingEnabled || false,
          remotePath: remotePath || undefined,
          localPath: localPath || undefined,
          category: category || 'readmeabook',
        };

        // Test connection before saving
        const testResult = await manager.testConnection(newClient);
        if (!testResult.success) {
          return NextResponse.json(
            { error: `Connection test failed: ${testResult.message}` },
            { status: 400 }
          );
        }

        // Encrypt all passwords before saving (existing clients come decrypted from getAllClients)
        const encryptionService = getEncryptionService();
        const allClients = [...existingClients, newClient];
        const encryptedClients = allClients.map(c => ({
          ...c,
          password: c.password ? encryptionService.encrypt(c.password) : '',
        }));

        // Save updated clients array
        await config.setMany([
          { key: 'download_clients', value: JSON.stringify(encryptedClients) },
        ]);

        // Invalidate cache
        invalidateDownloadClientManager();

        logger.info('Download client added', { id: newClient.id, type, name });

        return NextResponse.json({
          message: 'Download client added successfully',
          client: {
            ...newClient,
            password: '********',
          },
        });
      } catch (error) {
        logger.error('Failed to add download client', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json(
          { error: 'Failed to add download client' },
          { status: 500 }
        );
      }
    });
  });
}
