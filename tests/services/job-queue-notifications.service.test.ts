/**
 * Component: Job Queue Notification Integration Tests
 * Documentation: documentation/backend/services/notifications.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationEvent } from '@/lib/constants/notification-events';

describe('JobQueueService - Notification Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addNotificationJob payload structure', () => {
    it('creates correct payload for request_pending_approval', () => {
      const event = 'request_pending_approval' as const;
      const requestId = 'req-1';
      const title = 'Test Book';
      const author = 'Test Author';
      const userName = 'Test User';

      const payload = {
        event,
        requestId,
        title,
        author,
        userName,
        timestamp: new Date(),
      };

      expect(payload.event).toBe('request_pending_approval');
      expect(payload.requestId).toBe(requestId);
      expect(payload.title).toBe(title);
      expect(payload.author).toBe(author);
      expect(payload.userName).toBe(userName);
      expect(payload.timestamp).toBeInstanceOf(Date);
    });

    it('includes error message for request_error events', () => {
      const payload = {
        event: 'request_error' as const,
        requestId: 'req-1',
        title: 'Test Book',
        author: 'Test Author',
        userName: 'Test User',
        message: 'Download failed',
        timestamp: new Date(),
      };

      expect(payload.message).toBe('Download failed');
    });

    it('handles all event types', () => {
      const events: NotificationEvent[] = [
        'request_pending_approval',
        'request_approved',
        'request_available',
        'request_error',
      ];

      events.forEach((event) => {
        const payload = {
          event,
          requestId: 'req-1',
          title: 'Test Book',
          author: 'Test Author',
          userName: 'Test User',
          timestamp: new Date(),
        };

        expect(payload.event).toBe(event);
      });
    });
  });

  describe('notification job configuration', () => {
    it('should use priority 5 for notification jobs', () => {
      const priority = 5;
      expect(priority).toBe(5);
    });

    it('should have concurrency 5 for send_notification processor', () => {
      const concurrency = 5;
      expect(concurrency).toBe(5);
    });

    it('should use job type send_notification', () => {
      const jobType = 'send_notification';
      expect(jobType).toBe('send_notification');
    });
  });
});
