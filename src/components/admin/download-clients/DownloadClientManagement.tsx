/**
 * Component: Download Client Management Container
 * Documentation: documentation/phase3/download-clients.md
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { DownloadClientCard } from './DownloadClientCard';
import { DownloadClientModal } from './DownloadClientModal';
import { fetchWithAuth } from '@/lib/utils/api';

interface DownloadClient {
  id: string;
  type: 'qbittorrent' | 'sabnzbd';
  name: string;
  url: string;
  username?: string;
  password: string;
  enabled: boolean;
  disableSSLVerify: boolean;
  remotePathMappingEnabled: boolean;
  remotePath?: string;
  localPath?: string;
  category?: string;
}

interface DownloadClientManagementProps {
  mode: 'wizard' | 'settings';
  initialClients?: DownloadClient[];
  onClientsChange?: (clients: DownloadClient[]) => void;
}

export function DownloadClientManagement({
  mode,
  initialClients = [],
  onClientsChange,
}: DownloadClientManagementProps) {
  const [clients, setClients] = useState<DownloadClient[]>(initialClients);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'add' | 'edit';
    clientType?: 'qbittorrent' | 'sabnzbd';
    currentClient?: DownloadClient;
  }>({ isOpen: false, mode: 'add' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    clientId?: string;
    clientName?: string;
  }>({ isOpen: false });

  // Fetch clients when in settings mode
  useEffect(() => {
    if (mode === 'settings') {
      fetchClients();
    }
  }, [mode]);

  // Sync with parent when clients change
  useEffect(() => {
    if (onClientsChange) {
      onClientsChange(clients);
    }
  }, [clients, onClientsChange]);

  // Sync with initialClients prop changes (wizard mode)
  useEffect(() => {
    if (mode === 'wizard') {
      setClients(initialClients);
    }
  }, [initialClients, mode]);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth('/api/admin/settings/download-clients');

      if (!response.ok) {
        throw new Error('Failed to fetch download clients');
      }

      const data = await response.json();
      setClients(data.clients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch download clients');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClient = (type: 'qbittorrent' | 'sabnzbd') => {
    // Check if this type already exists
    const existingClient = clients.find(c => c.type === type && c.enabled);
    if (existingClient) {
      setError(`A ${type === 'qbittorrent' ? 'qBittorrent' : 'SABnzbd'} client is already configured.`);
      return;
    }

    setModalState({
      isOpen: true,
      mode: 'add',
      clientType: type,
    });
  };

  const handleEditClient = (client: DownloadClient) => {
    setModalState({
      isOpen: true,
      mode: 'edit',
      currentClient: client,
    });
  };

  const handleDeleteClient = (client: DownloadClient) => {
    setDeleteConfirm({
      isOpen: true,
      clientId: client.id,
      clientName: client.name,
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.clientId) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === 'settings') {
        // API call for settings mode
        const response = await fetchWithAuth(`/api/admin/settings/download-clients/${deleteConfirm.clientId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete download client');
        }

        await fetchClients(); // Refresh list
      } else {
        // Local removal for wizard mode
        setClients(clients.filter(c => c.id !== deleteConfirm.clientId));
      }

      setDeleteConfirm({ isOpen: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete download client');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClient = async (clientData: any) => {
    setLoading(true);
    setError(null);

    try {
      if (mode === 'settings') {
        // API call for settings mode
        if (modalState.mode === 'add') {
          const response = await fetchWithAuth('/api/admin/settings/download-clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientData),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to add download client');
          }

          await fetchClients(); // Refresh list
        } else {
          const response = await fetchWithAuth(`/api/admin/settings/download-clients/${clientData.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientData),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update download client');
          }

          await fetchClients(); // Refresh list
        }
      } else {
        // Local update for wizard mode
        if (modalState.mode === 'add') {
          const newClient = {
            ...clientData,
            id: `temp-${Date.now()}`, // Temporary ID for wizard mode
          };
          setClients([...clients, newClient]);
        } else {
          setClients(clients.map(c => (c.id === clientData.id ? { ...c, ...clientData } : c)));
        }
      }

      setModalState({ isOpen: false, mode: 'add' });
    } catch (err) {
      throw err; // Re-throw to let modal handle the error
    } finally {
      setLoading(false);
    }
  };

  const hasQBittorrent = clients.some(c => c.type === 'qbittorrent' && c.enabled);
  const hasSABnzbd = clients.some(c => c.type === 'sabnzbd' && c.enabled);

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-lg">
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add Client Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Add Download Client
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* qBittorrent Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  qBittorrent
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Torrent downloads
                </p>
              </div>
              <span className="inline-block text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                Torrent
              </span>
            </div>
            {hasQBittorrent ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Already configured
              </div>
            ) : (
              <Button
                onClick={() => handleAddClient('qbittorrent')}
                variant="primary"
                size="sm"
                disabled={loading}
              >
                Add qBittorrent
              </Button>
            )}
          </div>

          {/* SABnzbd Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  SABnzbd
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Usenet/NZB downloads
                </p>
              </div>
              <span className="inline-block text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">
                Usenet
              </span>
            </div>
            {hasSABnzbd ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Already configured
              </div>
            ) : (
              <Button
                onClick={() => handleAddClient('sabnzbd')}
                variant="primary"
                size="sm"
                disabled={loading}
              >
                Add SABnzbd
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Configured Clients Section */}
      {clients.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Configured Clients
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clients.map(client => (
              <DownloadClientCard
                key={client.id}
                client={client}
                onEdit={() => handleEditClient(client)}
                onDelete={() => handleDeleteClient(client)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {clients.length === 0 && !loading && (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            No download clients configured yet
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Add at least one client to start downloading audiobooks
          </p>
        </div>
      )}

      {/* Client Modal */}
      <DownloadClientModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, mode: 'add' })}
        mode={modalState.mode}
        clientType={modalState.clientType}
        initialClient={modalState.currentClient}
        onSave={handleSaveClient}
        apiMode={mode}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Delete Download Client
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete <strong>{deleteConfirm.clientName}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setDeleteConfirm({ isOpen: false })}
                variant="secondary"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDelete}
                variant="danger"
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
