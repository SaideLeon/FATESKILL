import { NextRequest, NextResponse } from "next/server";

type Category = "auth" | "publish" | "default";

const limits: Record<Category, { max: number; windowMs: number }> = {
  auth: { max: 5, windowMs: 60_000 },
  publish: { max: 10, windowMs: 10 * 60_000 },
  default: { max: 60, windowMs: 60_000 }
};

const memoryStore = new Map<string, { count: number; reset: number }>();

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

export async function enforceRateLimit(request: NextRequest, category: Category, identifier?: string): Promise<NextResponse | null> {
  const config = limits[category];
  const key = `${category}:${identifier ?? `ip:${clientIp(request)}`}`;

  // If Upstash REST credentials are present, use Redis through its HTTP API without adding a runtime dependency.
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    const redisKey = `rate:${key}`;
    const [incrResponse, ttlResponse] = await Promise.all([
      fetch(`${upstashUrl}/incr/${encodeURIComponent(redisKey)}`, { headers: { Authorization: `Bearer ${upstashToken}` }, cache: "no-store" }),
      fetch(`${upstashUrl}/pttl/${encodeURIComponent(redisKey)}`, { headers: { Authorization: `Bearer ${upstashToken}` }, cache: "no-store" })
    ]);
    const incr = await incrResponse.json().catch(() => ({ result: 1 }));
    const ttl = await ttlResponse.json().catch(() => ({ result: -1 }));
    if (Number(incr.result) === 1 || Number(ttl.result) < 0) {
      await fetch(`${upstashUrl}/pexpire/${encodeURIComponent(redisKey)}/${config.windowMs}`, { headers: { Authorization: `Bearer ${upstashToken}` }, cache: "no-store" });
    }
    if (Number(incr.result) > config.max) {
      const retryAfter = Math.max(1, Math.ceil((Number(ttl.result) > 0 ? Number(ttl.result) : config.windowMs) / 1000));
      return NextResponse.json({ error: "Too many requests, please try again later" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    }
    return null;
  }

  const now = Date.now();
  const current = memoryStore.get(key);
  if (!current || current.reset <= now) {
    memoryStore.set(key, { count: 1, reset: now + config.windowMs });
    return null;
  }
  current.count += 1;
  if (current.count > config.max) {
    return NextResponse.json({ error: "Too many requests, please try again later" }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.reset - now) / 1000)) } });
  }
  return null;
}
