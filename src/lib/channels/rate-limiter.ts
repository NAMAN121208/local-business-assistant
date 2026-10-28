// src/lib/channels/rate-limiter.ts

interface ChannelRateLimitRecord {
  timestamps: number[];
}

const channelRateLimits = new Map<string, ChannelRateLimitRecord>();

/**
 * Sliding window rate limiter per (channel, senderId).
 * Default: 20 messages per 60 seconds.
 */
export function isChannelRateLimited(
  channel: string,
  senderId: string,
  limit: number = 20,
  windowMs: number = 60000
): boolean {
  const key = `${channel}:${senderId}`;
  const now = Date.now();
  let record = channelRateLimits.get(key);
  if (!record) {
    record = { timestamps: [] };
    channelRateLimits.set(key, record);
  }

  // Filter out timestamps outside window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    return true;
  }

  record.timestamps.push(now);
  return false;
}

export function getFriendlyRateLimitMessage(): string {
  return 'You are sending messages too quickly to City Health Clinic assistant. Please wait a moment before sending another message. For urgent assistance or medical emergencies, please call +91 98765 99999.';
}

export function resetChannelRateLimits(): void {
  channelRateLimits.clear();
}
