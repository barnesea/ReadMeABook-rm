/**
 * Component: Admin Downloads API Route Tests
 * Documentation: documentation/testing.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../helpers/prisma';

let authRequest: any;

const prismaMock = createPrismaMock();
const requireAuthMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const configServiceMock = vi.hoisted(() => ({ get: vi.fn() }));
const qbittorrentMock = vi.hoisted(() => ({ getTorrent: vi.fn() }));
const sabnzbdMock = vi.hoisted(() => ({ getNZB: vi.fn() }));
const downloadClientManagerMock = vi.hoisted(() => ({
  getClientServiceForProtocol: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
  requireAdmin: requireAdminMock,
}));

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => configServiceMock,
}));

vi.mock('@/lib/integrations/qbittorrent.service', () => ({
  getQBittorrentService: async () => qbittorrentMock,
}));

vi.mock('@/lib/integrations/sabnzbd.service', () => ({
  getSABnzbdService: async () => sabnzbdMock,
}));

vi.mock('@/lib/services/download-client-manager.service', () => ({
  getDownloadClientManager: () => downloadClientManagerMock,
}));

describe('Admin downloads route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRequest = { user: { id: 'admin-1', role: 'admin' } };
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler(authRequest));
    requireAdminMock.mockImplementation((_req: any, handler: any) => handler());
    downloadClientManagerMock.getClientServiceForProtocol.mockReset();
  });

  it('returns formatted active downloads', async () => {
    prismaMock.request.findMany.mockResolvedValueOnce([
      {
        id: 'req-1',
        status: 'downloading',
        progress: 50,
        updatedAt: new Date(),
        audiobook: { title: 'Title', author: 'Author' },
        user: { plexUsername: 'user' },
        downloadHistory: [{ torrentHash: 'hash', torrentName: 'Torrent', downloadStatus: 'downloading', downloadClient: 'qbittorrent' }],
      },
    ]);
    downloadClientManagerMock.getClientServiceForProtocol.mockResolvedValueOnce({
      getDownload: vi.fn().mockResolvedValue({
        downloadSpeed: 123,
        eta: 60,
      }),
    });

    const { GET } = await import('@/app/api/admin/downloads/active/route');
    const response = await GET({} as any);
    const payload = await response.json();

    expect(payload.downloads[0].speed).toBe(123);
    expect(payload.downloads[0].torrentName).toBe('Torrent');
  });

  it('returns formatted active downloads for SABnzbd', async () => {
    prismaMock.request.findMany.mockResolvedValueOnce([
      {
        id: 'req-2',
        status: 'downloading',
        progress: 20,
        updatedAt: new Date(),
        audiobook: { title: 'Title', author: 'Author' },
        user: { plexUsername: 'user' },
        downloadHistory: [{ nzbId: 'nzb-1', torrentName: 'NZB', downloadStatus: 'downloading', downloadClient: 'sabnzbd' }],
      },
    ]);
    downloadClientManagerMock.getClientServiceForProtocol.mockResolvedValueOnce({
      getDownload: vi.fn().mockResolvedValue({
        downloadSpeed: 555,
        eta: 120,
      }),
    });

    const { GET } = await import('@/app/api/admin/downloads/active/route');
    const response = await GET({} as any);
    const payload = await response.json();

    expect(payload.downloads[0].speed).toBe(555);
    expect(payload.downloads[0].eta).toBe(120);
  });

  it('returns defaults when download client lookup fails', async () => {
    prismaMock.request.findMany.mockResolvedValueOnce([
      {
        id: 'req-3',
        status: 'downloading',
        progress: 80,
        updatedAt: new Date(),
        audiobook: { title: 'Title', author: 'Author' },
        user: { plexUsername: 'user' },
        downloadHistory: [{ torrentHash: 'hash', torrentName: 'Torrent', downloadStatus: 'downloading', downloadClient: 'qbittorrent' }],
      },
    ]);
    downloadClientManagerMock.getClientServiceForProtocol.mockResolvedValueOnce({
      getDownload: vi.fn().mockRejectedValue(new Error('client down')),
    });

    const { GET } = await import('@/app/api/admin/downloads/active/route');
    const response = await GET({} as any);
    const payload = await response.json();

    expect(payload.downloads[0].speed).toBe(0);
    expect(payload.downloads[0].eta).toBeNull();
  });
});


