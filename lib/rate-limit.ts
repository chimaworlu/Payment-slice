import { randomUUID } from 'crypto';
import IORedis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is not set');
}

const redis = new IORedis(process.env.REDIS_URL);

/**
 * Sliding window rate limiter backed by a Redis sorted set: each request's
 * timestamp is a member, entries older than the window are trimmed, and the
 * remaining count decides the limit. Standard EVAL — no proprietary flags.
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)

local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, 0}
end

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retryAfterMs = 0
if oldest[2] then
  retryAfterMs = (tonumber(oldest[2]) + window) - now
end

return {0, retryAfterMs}
`;

interface RateLimiter {
  limit: number;
  windowMs: number;
  prefix: string;
}

export const signInLimiter: RateLimiter = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
  prefix: 'ratelimit:sign-in',
};

export const signUpLimiter: RateLimiter = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
  prefix: 'ratelimit:sign-up',
};

export const passwordResetLimiter: RateLimiter = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
  prefix: 'ratelimit:password-reset',
};

export const resendLimiter: RateLimiter = {
  limit: 1,
  windowMs: 60 * 1000,
  prefix: 'ratelimit:resend',
};

export const checkoutLimiter: RateLimiter = {
  limit: 5,
  windowMs: 60 * 1000,
  prefix: 'ratelimit:checkout',
};

export async function checkRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<{ success: boolean; retryAfter: number }> {
  const now = Date.now();
  const member = `${now}-${randomUUID()}`;

  const [success, retryAfterMs] = (await redis.eval(
    SLIDING_WINDOW_SCRIPT,
    1,
    `${limiter.prefix}:${identifier}`,
    now,
    limiter.windowMs,
    limiter.limit,
    member
  )) as [number, number];

  if (success === 1) {
    return { success: true, retryAfter: 0 };
  }

  return { success: false, retryAfter: Math.max(0, Math.ceil(retryAfterMs / 1000)) };
}
