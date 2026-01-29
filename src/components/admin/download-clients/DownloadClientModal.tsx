/**
 * Component: Download Client Configuration Modal
 * Documentation: documentation/phase3/download-clients.md
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fetchWithAuth } from '@/lib/utils/api';

interface DownloadClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'add' | 'edit';
  clientType?: 'qbittorrent' | 'sabnzbd';
  initialClient?: {
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
  };
  onSave: (client: any) => Promise<void>;
  apiMode: 'wizard' | 'settings';
}

export function DownloadClientModal({
  isOpen,
  onClose,
  mode,
  clientType,
  initialClient,
  onSave,
  apiMode,
}: DownloadClientModalProps) {
  const type = mode === 'edit' ? initialClient?.type : clientType;
  const typeName = type === 'qbittorrent' ? 'qBittorrent' : 'SABnzbd';

  // Form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [disableSSLVerify, setDisableSSLVerify] = useState(false);
  const [remotePathMappingEnabled, setRemotePathMappingEnabled] = useState(false);
  const [remotePath, setRemotePath] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [category, setCategory] = useState('readmeabook');

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialClient) {
        setName(initialClient.name);
        setUrl(initialClient.url);
        setUsername(initialClient.username || '');
        // In wizard mode, use actual password from local state
        // In settings mode, mask password (server doesn't send real passwords)
        setPassword(apiMode === 'wizard' ? initialClient.password : '********');
        setEnabled(initialClient.enabled);
        setDisableSSLVerify(initialClient.disableSSLVerify);
        setRemotePathMappingEnabled(initialClient.remotePathMappingEnabled);
        setRemotePath(initialClient.remotePath || '');
        setLocalPath(initialClient.localPath || '');
        setCategory(initialClient.category || 'readmeabook');
      } else {
        // Add mode defaults
        setName(typeName);
        setUrl('');
        setUsername('');
        setPassword('');
        setEnabled(true);
        setDisableSSLVerify(false);
        setRemotePathMappingEnabled(false);
        setRemotePath('');
        setLocalPath('');
        setCategory('readmeabook');
      }
      setTestResult(null);
      setErrors({});
    }
  }, [isOpen, mode, initialClient, type]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!url.trim()) {
      newErrors.url = 'URL is required';
    }

    if (type === 'qbittorrent' && !username.trim()) {
      newErrors.username = 'Username is required for qBittorrent';
    }

    if (!password.trim() || (mode === 'add' && password === '********')) {
      newErrors.password = type === 'qbittorrent' ? 'Password is required' : 'API key is required';
    }

    if (remotePathMappingEnabled) {
      if (!remotePath.trim()) {
        newErrors.remotePath = 'Remote path is required when path mapping is enabled';
      }
      if (!localPath.trim()) {
        newErrors.localPath = 'Local path is required when path mapping is enabled';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validate()) {
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // If editing and password is masked, send clientId so server uses stored password
      const isPasswordMasked = password === '********';

      const testData = {
        type,
        url,
        username: type === 'qbittorrent' ? username : undefined,
        password: isPasswordMasked ? undefined : password,
        // Include clientId when editing so server can use stored password
        ...(mode === 'edit' && initialClient && isPasswordMasked ? { clientId: initialClient.id } : {}),
        disableSSLVerify,
        remotePathMappingEnabled,
        remotePath: remotePathMappingEnabled ? remotePath : undefined,
        localPath: remotePathMappingEnabled ? localPath : undefined,
      };

      const endpoint = apiMode === 'wizard'
        ? '/api/setup/test-download-client'
        : '/api/admin/settings/download-clients/test';

      // Wizard mode: no auth required (public endpoint during setup)
      // Settings mode: use fetchWithAuth to include JWT token
      const response = apiMode === 'wizard'
        ? await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData),
          })
        : await fetchWithAuth(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData),
          });

      const data = await response.json();

      if (response.ok && data.success) {
        // Handle both endpoint response formats (settings returns message, wizard returns version)
        const message = data.message || (data.version ? `Connected successfully (v${data.version})` : 'Connection successful');
        setTestResult({ success: true, message });
      } else {
        setTestResult({ success: false, message: data.error || 'Connection test failed' });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    if (!testResult?.success) {
      setErrors({ ...errors, test: 'Please test the connection before saving' });
      return;
    }

    setSaving(true);

    try {
      const clientData: any = {
        type,
        name,
        url,
        username: type === 'qbittorrent' ? username : undefined,
        password: password === '********' ? undefined : password, // Don't send masked password on edit
        enabled,
        disableSSLVerify,
        remotePathMappingEnabled,
        remotePath: remotePathMappingEnabled ? remotePath : undefined,
        localPath: remotePathMappingEnabled ? localPath : undefined,
        category,
      };

      if (mode === 'edit' && initialClient) {
        clientData.id = initialClient.id;
      }

      await onSave(clientData);
      onClose();
    } catch (error) {
      setErrors({
        ...errors,
        save: error instanceof Error ? error.message : 'Failed to save client',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${mode === 'add' ? 'Add' : 'Edit'} ${typeName}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`My ${typeName}`}
            error={errors.name}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Friendly name to identify this client
          </p>
        </div>

        {/* URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            URL
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={type === 'qbittorrent' ? 'http://localhost:8080' : 'http://localhost:8081'}
            error={errors.url}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Web UI URL (e.g., http://localhost:8080)
          </p>
        </div>

        {/* Username (qBittorrent only) */}
        {type === 'qbittorrent' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              error={errors.username}
            />
          </div>
        )}

        {/* Password / API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {type === 'qbittorrent' ? 'Password' : 'API Key'}
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={type === 'qbittorrent' ? 'Password' : 'API Key from SABnzbd Config > General'}
            error={errors.password}
          />
          {type === 'sabnzbd' && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Found in SABnzbd under Config → General → API Key
            </p>
          )}
        </div>

        {/* SSL Verification */}
        {url.startsWith('https://') && (
          <div className="flex items-start">
            <input
              type="checkbox"
              id="disableSSLVerify"
              checked={disableSSLVerify}
              onChange={(e) => setDisableSSLVerify(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="disableSSLVerify" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Disable SSL certificate verification
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Use for self-signed certificates (not recommended for production)
              </p>
            </label>
          </div>
        )}

        {/* Enabled Toggle */}
        <div className="flex items-start">
          <input
            type="checkbox"
            id="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="enabled" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            Enabled
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Use this client for downloads
            </p>
          </label>
        </div>

        {/* Remote Path Mapping */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-start mb-3">
            <input
              type="checkbox"
              id="remotePathMapping"
              checked={remotePathMappingEnabled}
              onChange={(e) => setRemotePathMappingEnabled(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="remotePathMapping" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Enable Remote Path Mapping
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Use when download client sees a different filesystem than ReadMeABook
              </p>
            </label>
          </div>

          {remotePathMappingEnabled && (
            <div className="space-y-3 ml-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Remote Path ({typeName})
                </label>
                <Input
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="F:\Docker\downloads\completed\books"
                  error={errors.remotePath}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Path as seen by {typeName}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Local Path (ReadMeABook)
                </label>
                <Input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder="/downloads"
                  error={errors.localPath}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Path as seen by ReadMeABook
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`p-3 rounded-md ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}
          >
            <p className="text-sm">{testResult.message}</p>
          </div>
        )}

        {/* Errors */}
        {errors.test && (
          <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300">
            <p className="text-sm">{errors.test}</p>
          </div>
        )}

        {errors.save && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300">
            <p className="text-sm">{errors.save}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={handleTestConnection}
            disabled={testing}
            variant="secondary"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>

          <div className="flex gap-2">
            <Button onClick={onClose} variant="secondary" disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !testResult?.success}
            >
              {saving ? 'Saving...' : mode === 'add' ? 'Add Client' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
