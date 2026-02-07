/**
 * Component: Request Limit Info Display
 * Documentation: documentation/admin-features/request-limits.md
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { RMABLogger } from '@/lib/utils/logger';
import { formatTimeUntil } from '@/lib/utils/time';

const logger = RMABLogger.create('RequestLimitInfo');

interface RequestLimitInfo {
  count: number;
  periodDays: number;
  requestsMade: number;
  resetAt: string;
  isUnlimited: boolean;
}

export function RequestLimitInfo() {
  const { user } = useAuth();
  const [limitInfo, setLimitInfo] = useState<RequestLimitInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeUntilReset, setTimeUntilReset] = useState<string>('');

  useEffect(() => {
    if (user) {
      fetchLimitInfo();
    } else {
      setLimitInfo(null);
    }
  }, [user]);

  useEffect(() => {
    if (limitInfo && !limitInfo.isUnlimited) {
      const updateTimer = () => {
        const resetAt = new Date(limitInfo.resetAt);
        setTimeUntilReset(formatTimeUntil(resetAt));
      };

      updateTimer();
      const interval = setInterval(updateTimer, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [limitInfo]);

  const fetchLimitInfo = async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) return;

      const response = await fetch('/api/requests/limit-info', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setLimitInfo(data);
      }
    } catch (error) {
      logger.error('Failed to fetch limit info', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user || !limitInfo) {
    return null;
  }

  // Admin users have unlimited requests
  if (limitInfo.isUnlimited) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-green-700 dark:text-green-300">
            Unlimited Requests
          </span>
        </div>
      </div>
    );
  }

  const { count, periodDays, requestsMade } = limitInfo;
  const remaining = count - requestsMade;

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-blue-700 dark:text-blue-300">
          {requestsMade}/{count} req
        </span>
        <span className="text-gray-500 dark:text-gray-400">/ {periodDays}d</span>
        <span className="text-gray-400 dark:text-gray-500">|</span>
        <span className="text-green-600 dark:text-green-400 font-medium">
          {remaining} left
        </span>
        <span className="text-gray-400 dark:text-gray-500">|</span>
        <span className="text-gray-600 dark:text-gray-400">
          Reset: {timeUntilReset}
        </span>
      </div>
    </div>
  );
}

export default RequestLimitInfo;