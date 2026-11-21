import IORedis from "ioredis";

// maxRetriesPerRequest must be null for BullMQ workers.
export function createRedis(url: string) {
  return new IORedis(url, { maxRetriesPerRequest: null });
}
