/**
 * Component: Request Limits Settings Tab
 * Documentation: documentation/admin-features/request-limits.md
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('RequestLimitsTab');

interface RequestLimitConfig {
  enabled: boolean;
  count: number;
  period: number;
}

export function RequestLimitsTab() {
  const [config, setConfig] = useState<RequestLimitConfig>({
    enabled: false,
    count: 5,
    period: 7,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load current configuration
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/settings/request-limits');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
      }
    } catch (error) {
      logger.error('Failed to load request limit config', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigChange = (field: keyof RequestLimitConfig, value: boolean | number) => {
    setConfig((prev) => {
      const updated = { ...prev, [field]: value };
      setHasChanges(true);
      return updated;
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await fetch('/api/admin/settings/request-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        const data = await response.json();
        setHasChanges(false);
        logger.info('Request limit config saved', { config: data.config });
      } else {
        const error = await response.json();
        console.error('Failed to save:', error);
      }
    } catch (error) {
      logger.error('Failed to save request limit config', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Request Limits Configuration
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Configure server-wide request limits for new users. Users can have individual limits set in the Admin Users page.
        </p>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-1">
              Enable Request Limits
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {config.enabled ? 'Request limits are currently enabled' : 'Request limits are currently disabled'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleConfigChange('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      {/* Max Requests Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Max Requests
        </label>
        <Input
          type="number"
          min="0"
          max="1000"
          value={config.count}
          onChange={(e) => handleConfigChange('count', parseInt(e.target.value, 10) || 0)}
          disabled={!config.enabled}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Maximum number of requests allowed per period (0 = unlimited)
        </p>
      </div>

      {/* Period Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Period (Days)
        </label>
        <Input
          type="number"
          min="0"
          max="365"
          value={config.period}
          onChange={(e) => handleConfigChange('period', parseInt(e.target.value, 10) || 0)}
          disabled={!config.enabled}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Time period in days (0 = unlimited)
        </p>
      </div>

      {/* Info Alert */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>How it works:</strong> Users can make up to <strong>{config.count}</strong> requests every <strong>{config.period} days</strong>. The limit resets after the period expires. Admins are not affected by this limit.
        </p>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <Button
            onClick={handleSave}
            loading={isSaving}
            className="w-full"
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default RequestLimitsTab;