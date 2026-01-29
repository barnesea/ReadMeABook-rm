/**
 * Component: Admin Download Clients Management API
 * Documentation: documentation/phase3/download-clients.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getConfigService } from '@/lib/services/config.service';
import { getDownloadClientManager, invalidateDownloadClientManager } from '@/lib/services/download-client-manager.service';
import { DownloadClientConfig } from '@/lib/services/download-client-manager.service';
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
        if (!name || !url || !password) {
          return NextResponse.json(
            { error: 'Name, URL, and password/API key are required' },
            { status: 400 }
          );
        }

        // qBittorrent requires username
        if (type === 'qbittorrent' && !username) {
          return NextResponse.json(
            { error: 'Username is required for qBittorrent' },
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

        // Create new client config
        const newClient: DownloadClientConfig = {
          id: randomUUID(),
          type,
          name,
          enabled: true,
          url,
          username: username || undefined,
          password,
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

        // Save updated clients array
        const updatedClients = [...existingClients, newClient];
        await config.setMany([
          { key: 'download_clients', value: JSON.stringify(updatedClients) },
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
