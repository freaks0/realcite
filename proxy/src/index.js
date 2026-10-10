/**
 * CiteGuard 프록시 — CORS가 없거나 불완전한 학술 API를 브라우저에서 쓸 수 있게 중계.
 * 대상은 아래 allowlist의 GET 요청만. 입력 데이터는 저장하지 않음.
 *
 *   /s2/...    → api.semanticscholar.org  (429 응답에 CORS 헤더가 없어 브라우저에서 깨지는 문제 해결)
 *   /arxiv/... → export.arxiv.org         (CORS 미지원)
 *   /dblp/...  → dblp.org                 (CORS 미지원. 2026-10 현재 Anubis 봇 차단으로
 *                                          API 응답 불가 — 차단 해제 시 재활용, 우회 금지)
 */

const UPSTREAMS = {
  s2: "https://api.semanticscholar.org",
  arxiv: "https://export.arxiv.org",
  dblp: "https://dblp.org",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET") {
      return new Response("GET only", { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const [, prefix, ...rest] = url.pathname.split("/");
    const upstream = UPSTREAMS[prefix];
    if (!upstream || rest.length === 0) {
      return new Response("Unknown route. Use /s2/, /arxiv/, /dblp/", {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    const target = `${upstream}/${rest.join("/")}${url.search}`;
    const res = await fetch(target, {
      headers: { Accept: request.headers.get("Accept") ?? "application/json" },
      cf: { cacheTtl: 600, cacheEverything: true },
    });

    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    headers.delete("set-cookie");
    return new Response(res.body, { status: res.status, headers });
  },
};
