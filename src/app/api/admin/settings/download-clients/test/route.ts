/**
 * Component: Test Download Client Connection API
 * Documentation: documentation/phase3/download-clients.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { getConfigService } from '@/lib/services/config.service';
import { getDownloadClientManager } from '@/lib/services/download-client-manager.service';
import { DownloadClientConfig } from '@/lib/services/download-client-manager.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Admin.Settings.DownloadClients.Test');

/**
 * POST - Test download client connection
 */
export async function POST(request: NextRequest) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const body = await request.json();
        const {
          clientId, // Optional: existing client ID to use stored password
          type,
          url,
          username,
          password,
          disableSSLVerify,
          remotePathMappingEnabled,
          remotePath,
          localPath,
        } = body;

        // Validate type
        if (type !== 'qbittorrent' && type !== 'sabnzbd') {
          return NextResponse.json(
            { error: 'Invalid client type. Must be qbittorrent or sabnzbd' },
            { status: 400 }
          );
        }

        const config = await getConfigService();
        const manager = getDownloadClientManager(config);

        // If editing an existing client and password not provided, use stored password
        let effectivePassword = password;
        let effectiveUsername = username;

        if (clientId && !password) {
          const existingClients = await manager.getAllClients();
          const existingClient = existingClients.find(c => c.id === clientId);

          if (!existingClient) {
            return NextResponse.json(
              { error: 'Client not found' },
              { status: 404 }
            );
          }

          effectivePassword = existingClient.password;
          // Also use stored username if not provided (for qBittorrent)
          if (!username && existingClient.username) {
            effectiveUsername = existingClient.username;
          }
        }

        // Validate required fields
        if (!url || !effectivePassword) {
          return NextResponse.json(
            { error: 'URL and password/API key are required' },
            { status: 400 }
          );
        }

        if (type === 'qbittorrent' && !effectiveUsername) {
          return NextResponse.json(
            { error: 'Username is required for qBittorrent' },
            { status: 400 }
          );
        }

        // Create temporary client config for testing
        const testConfig: DownloadClientConfig = {
          id: 'test',
          type,
          name: 'Test Client',
          enabled: true,
          url,
          username: effectiveUsername || undefined,
          password: effectivePassword,
          disableSSLVerify: disableSSLVerify || false,
          remotePathMappingEnabled: remotePathMappingEnabled || false,
          remotePath: remotePath || undefined,
          localPath: localPath || undefined,
          category: 'readmeabook',
        };

        const result = await manager.testConnection(testConfig);

        if (result.success) {
          return NextResponse.json({
            success: true,
            message: result.message,
          });
        } else {
          return NextResponse.json(
            {
              success: false,
              error: result.message,
            },
            { status: 400 }
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Connection test failed', { error: message });
        return NextResponse.json(
          {
            success: false,
            error: message,
          },
          { status: 400 }
        );
      }
    });
  });
}
