/**
 * Component: Auth Token Cache Service
 * Documentation: documentation/backend/services/auth.md
 *
 * Provides secure server-side storage for Plex OAuth tokens during the
 * profile selection flow. Tokens are stored in memory with automatic
 * expiration to prevent sensitive data from being exposed in client responses.
 *
 * Security: This service exists to prevent Plex tokens from being embedded
 * in HTML responses or JSON payloads where they could be captured by
 * viewing page source or intercepting network traffic.
 */

import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('AuthTokenCache');

interface CachedToken {
  token: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Default TTL for cached tokens (5 minutes)
 * This is sufficient time for profile selection while minimizing exposure window
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Cleanup interval - run every minute to remove expired tokens
 */
const CLEANUP_INTERVAL_MS = 60 * 1000;

/**
 * AuthTokenCacheService - Singleton service for secure token storage
 *
 * Uses an in-memory Map for storage. Tokens are automatically expired
 * and cleaned up. This is intentionally ephemeral - if the server restarts,
 * users in the middle of profile selection will need to re-authenticate,
 * which is acceptable for security.
 */
class AuthTokenCacheService {
  private cache: Map<string, CachedToken> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.startCleanupInterval();
  }

  /**
   * Store a Plex token for later retrieval
   *
   * @param pinId - The Plex PIN ID (used as the lookup key)
   * @param token - The Plex OAuth token to store
   * @param ttlMs - Optional custom TTL for this token
   */
  set(pinId: string, token: string, ttlMs?: number): void {
    const effectiveTtl = ttlMs ?? this.ttlMs;
    const now = Date.now();

    this.cache.set(pinId, {
      token,
      createdAt: now,
      expiresAt: now + effectiveTtl,
    });

    logger.debug('Token cached', {
      pinId,
      ttlSeconds: Math.round(effectiveTtl / 1000),
      cacheSize: this.cache.size,
    });
  }

  /**
   * Retrieve a stored token by PIN ID
   *
   * @param pinId - The Plex PIN ID
   * @returns The stored token, or null if not found/expired
   */
  get(pinId: string): string | null {
    const cached = this.cache.get(pinId);

    if (!cached) {
      logger.debug('Token not found in cache', { pinId });
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      logger.debug('Token expired', { pinId });
      this.cache.delete(pinId);
      return null;
    }

    logger.debug('Token retrieved from cache', { pinId });
    return cached.token;
  }

  /**
   * Remove a token from the cache
   * Called after successful authentication to clean up
   *
   * @param pinId - The Plex PIN ID
   * @returns true if a token was removed, false if not found
   */
  delete(pinId: string): boolean {
    const existed = this.cache.has(pinId);
    this.cache.delete(pinId);

    if (existed) {
      logger.debug('Token removed from cache', { pinId, cacheSize: this.cache.size });
    }

    return existed;
  }

  /**
   * Check if a token exists and is not expired
   *
   * @param pinId - The Plex PIN ID
   * @returns true if token exists and is valid
   */
  has(pinId: string): boolean {
    const cached = this.cache.get(pinId);
    if (!cached) return false;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(pinId);
      return false;
    }

    return true;
  }

  /**
   * Get the current cache size (for monitoring)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Manually trigger cleanup of expired tokens
   * Called automatically on interval, but can be called manually if needed
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [pinId, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(pinId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug('Expired tokens cleaned up', { removed, remaining: this.cache.size });
    }

    return removed;
  }

  /**
   * Clear all cached tokens
   * Use with caution - will force all users in profile selection to re-authenticate
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    logger.info('Token cache cleared', { tokensRemoved: count });
  }

  /**
   * Start the automatic cleanup interval
   */
  private startCleanupInterval(): void {
    // Don't start multiple intervals
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent Node.js from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    logger.debug('Cleanup interval started', { intervalMs: CLEANUP_INTERVAL_MS });
  }

  /**
   * Stop the cleanup interval (for testing or shutdown)
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('Cleanup interval stopped');
    }
  }
}

// Singleton instance
let instance: AuthTokenCacheService | null = null;

/**
 * Get the singleton AuthTokenCacheService instance
 */
export function getAuthTokenCache(): AuthTokenCacheService {
  if (!instance) {
    instance = new AuthTokenCacheService();
    logger.info('Auth token cache initialized');
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing only)
 */
export function resetAuthTokenCache(): void {
  if (instance) {
    instance.stopCleanupInterval();
    instance.clear();
    instance = null;
  }
}

export { AuthTokenCacheService };
