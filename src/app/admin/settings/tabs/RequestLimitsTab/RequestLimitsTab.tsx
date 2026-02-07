/**
 * Component: Request Limits Settings Tab
 * Documentation: documentation/admin-features/request-limits.md
 */

'use client';

import React from 'react';
import { Input } from '@/components/ui/Input';
import { RMABLogger } from '@/lib/utils/logger';
import type { RequestLimitSettings } from '@/app/admin/settings/lib/types';

const logger = RMABLogger.create('RequestLimitsTab');

interface RequestLimitsTabProps {
  settings: RequestLimitSettings;
  onChange: (settings: RequestLimitSettings) => void;
}

export function RequestLimitsTab({ settings, onChange }: RequestLimitsTabProps) {
  const handleConfigChange = (field: keyof RequestLimitSettings, value: boolean | number) => {
    onChange({ ...settings, [field]: value });
  };

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
              {settings.enabled ? 'Request limits are currently enabled' : 'Request limits are currently disabled'}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
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
          value={settings.count}
          onChange={(e) => handleConfigChange('count', parseInt(e.target.value, 10) || 0)}
          disabled={!settings.enabled}
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
          value={settings.period}
          onChange={(e) => handleConfigChange('period', parseInt(e.target.value, 10) || 0)}
          disabled={!settings.enabled}
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          Time period in days (0 = unlimited)
        </p>
      </div>

      {/* Info Alert */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>How it works:</strong> Users can make up to <strong>{settings.count}</strong> requests every <strong>{settings.period} days</strong>. The limit resets after the period expires. Admins are not affected by this limit.
        </p>
      </div>
    </div>
  );
}

export default RequestLimitsTab;