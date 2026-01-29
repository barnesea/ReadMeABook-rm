/**
 * Component: Download Client Settings Tab
 * Documentation: documentation/settings-pages.md
 */

'use client';

import React from 'react';
import { DownloadClientManagement } from '@/components/admin/download-clients/DownloadClientManagement';
import type { DownloadClientSettings } from '../../lib/types';

interface DownloadTabProps {
  downloadClient: DownloadClientSettings;
  onChange: (settings: DownloadClientSettings) => void;
  onValidationChange: (isValid: boolean) => void;
}

export function DownloadTab({ downloadClient, onChange, onValidationChange }: DownloadTabProps) {
  // Store callback in ref to avoid re-running effect when callback reference changes
  const onValidationChangeRef = React.useRef(onValidationChange);
  onValidationChangeRef.current = onValidationChange;

  // Validation is handled by the DownloadClientManagement component
  // At least one enabled client is required
  React.useEffect(() => {
    // Always valid in settings mode - validation handled by individual save operations
    onValidationChangeRef.current(true);
  }, []); // Empty deps - only run once on mount

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Download Clients
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Configure one or both download clients to enable automatic downloads. qBittorrent handles torrents, while SABnzbd handles Usenet/NZB downloads.
        </p>
      </div>

      <DownloadClientManagement mode="settings" />
    </div>
  );
}
