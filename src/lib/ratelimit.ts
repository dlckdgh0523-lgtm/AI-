/**
 * IP 기반 레이트리밋 (인메모리 슬라이딩 윈도우).
 *
 * 위협 모델: /api/chat은 요청당 LLM 비용($0.05~0.3)이 발생하는 공개 엔드포인트다.
 * 인증 없는 데모 특성상 누구나 curl로 호출할 수 있으므로, 봇/스크립트의
 * 반복 호출로 API 크레딧이 소진되는 "지갑 고갈(Denial of Wallet)"을 막는다.
 *
 * 한계(의도적 트레이드오프): 인메모리라 서버리스 인스턴스별로 카운터가 분리된다.
 * 완전한 보호는 Upstash/Redis 같은 공유 저장소가 필요하지만, 프로토타입 범위에서는
 * 외부 인프라 없이 "스크립트 남용을 실질적으로 차단"하는 것이 목적이다.
 * (Vercel은 웜 인스턴스를 재사용하므로 연속 호출은 같은 카운터에 걸린다.)
 */

const WINDOW_MS = 60_000; // 1분 윈도우
const MAX_PER_WINDOW = 6; // 분당 6회 — 사람의 대화 속도로는 충분, 스크립트에는 빡빡
const DAY_MS = 24 * 60 * 60_000;
const MAX_PER_DAY = 100; // 인스턴스 수명 기준 상한

interface Bucket {
  stamps: number[]; // 최근 요청 시각 (슬라이딩 윈도우)
  dayCount: number;
  dayStart: number;
}

const buckets = new Map<string, Bucket>();

/** 오래된 버킷 정리 (요청 시마다 저비용으로 수행) */
function sweep(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, b] of buckets) {
    if (b.stamps.length === 0 || now - b.stamps[b.stamps.length - 1] > DAY_MS) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** 차단 시 재시도까지 남은 초 */
  retryAfterSec?: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let b = buckets.get(ip);
  if (!b) {
    b = { stamps: [], dayCount: 0, dayStart: now };
    buckets.set(ip, b);
  }

  // 일일 카운터 리셋
  if (now - b.dayStart > DAY_MS) {
    b.dayCount = 0;
    b.dayStart = now;
  }
  if (b.dayCount >= MAX_PER_DAY) {
    return { allowed: false, retryAfterSec: Math.ceil((b.dayStart + DAY_MS - now) / 1000) };
  }

  // 슬라이딩 윈도우
  b.stamps = b.stamps.filter((t) => now - t < WINDOW_MS);
  if (b.stamps.length >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfterSec: Math.ceil((b.stamps[0] + WINDOW_MS - now) / 1000) };
  }

  b.stamps.push(now);
  b.dayCount++;
  return { allowed: true };
}

/** 요청에서 클라이언트 IP 추출 (Vercel은 x-forwarded-for 첫 항목이 실제 클라이언트) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
