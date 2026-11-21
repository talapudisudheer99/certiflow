import IORedis from "ioredis";

// maxRetriesPerRequest must be null for BullMQ workers.
export function createRedis(url: string) {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

// For request-path caching: give up quickly when Redis is unavailable.
export function createCacheRedis(url: string) {
  return new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2000 });
}
