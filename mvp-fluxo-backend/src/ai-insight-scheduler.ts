import { redis } from "./redis";

const QUEUE_KEY = "ai:insight:queue";

export async function enqueueAiInsightJob(jobId: string): Promise<void> {
  await redis.lpush(QUEUE_KEY, jobId);
}

export async function processAiInsightQueue(limit = 2): Promise<number> {
  const { processAiInsightJob } = await import("./ai-insights.js");
  let processed = 0;

  for (let i = 0; i < limit; i += 1) {
    const jobId = await redis.rpop(QUEUE_KEY);
    if (!jobId) break;

    try {
      await processAiInsightJob(jobId);
      processed += 1;
    } catch {
      // status failed já persistido em processAiInsightJob
    }
  }

  return processed;
}

export function startAiInsightScheduler(intervalMs = 8_000): NodeJS.Timeout {
  return setInterval(() => {
    void processAiInsightQueue().catch(() => undefined);
  }, intervalMs);
}
