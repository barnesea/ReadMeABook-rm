/**
 * Utility: Time formatting functions
 */

/**
 * Calculate the time remaining until a target date
 * @param targetDate The date to calculate time until
 * @returns Formatted time string (e.g., "5d 7h 30m" or "7h 30m")
 */
export function formatTimeUntil(targetDate: Date): string {
  const now = new Date().getTime();
  const targetTime = targetDate.getTime();
  const diff = targetTime - now;

  if (diff <= 0) {
    return 'Now';
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}