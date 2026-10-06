import type { RecordAuthor, RetractionStatus, SourceRecord } from "./types";

/**
 * Crossref polite pool 식별용 운영자 연락처.
 * 배포 시 운영자 본인 이메일로 유지할 것 (요청량 제어·공지 수신 목적, Crossref 권장사항).
 */
export const MAILTO = "egrjang@nate.com";

/** 429/5xx 지수 백오프 재시도 fetch */
async function fetchJson(url: string, tries = 3): Promise<unknown | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      // 네트워크 오류 — 재시도
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
  throw new Error(`요청 실패: ${new URL(url).hostname}`);
}

/** "Ashish Vaswani" → {given: "Ashish", family: "Vaswani"} */
function splitDisplayName(name: string): RecordAuthor | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  if (parts.length === 1) return { family: parts[0] };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") };
}

/* ---------------- Crossref ---------------- */

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: { family?: string; given?: string; name?: string }[];
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  URL?: string;
  type?: string;
  "update-to"?: { DOI?: string; type?: string; label?: string }[];
}

function crossrefToRecord(w: CrossrefWork): SourceRecord | null {
  const title = w.title?.[0]?.replace(/\s+/g, " ").trim();
  if (!title) return null;
  const authors: RecordAuthor[] = [];
  for (const a of w.author ?? []) {
    if (a.family) authors.push({ family: a.family, given: a.given });
    else if (a.name) {
      const split = splitDisplayName(a.name);
      if (split) authors.push(split);
    }
  }
  return {
    source: "crossref",
    doi: w.DOI,
    title,
    authors,
    year: w.issued?.["date-parts"]?.[0]?.[0],
    journal: w["container-title"]?.[0],
    url: w.DOI ? `https://doi.org/${w.DOI}` : w.URL,
    type: w.type,
    isPreprint: w.type === "posted-content",
  };
}

const CROSSREF_SELECT = "DOI,title,author,issued,container-title,type";

export async function crossrefByDoi(doi: string): Promise<SourceRecord | null> {
  const json = (await fetchJson(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=${MAILTO}`
  )) as { message?: CrossrefWork } | null;
  return json?.message ? crossrefToRecord(json.message) : null;
}

/** 자유형 인용 문자열 매칭 — Crossref가 이 용도로 제공하는 전용 쿼리 */
export async function crossrefSearchBibliographic(
  citation: string,
  rows = 5
): Promise<SourceRecord[]> {
  const q = encodeURIComponent(citation.slice(0, 500));
  const json = (await fetchJson(
    `https://api.crossref.org/works?query.bibliographic=${q}&rows=${rows}&select=${CROSSREF_SELECT}&mailto=${MAILTO}`
  )) as { message?: { items?: CrossrefWork[] } } | null;
  return (json?.message?.items ?? [])
    .map(crossrefToRecord)
    .filter((r): r is SourceRecord => r !== null);
}

/**
 * 철회/정정 확인 — Retraction Watch 데이터가 Crossref에 통합되어 있어
 * 해당 DOI를 갱신(update-to)하는 공지 레코드를 조회하면 무료로 확인 가능.
 */
export async function crossrefRetractionCheck(doi: string): Promise<RetractionStatus> {
  const json = (await fetchJson(
    `https://api.crossref.org/works?filter=updates:${encodeURIComponent(doi)}&rows=10&select=DOI,type,update-to&mailto=${MAILTO}`
  )) as { message?: { items?: CrossrefWork[] } } | null;
  const items = json?.message?.items ?? [];
  const target = doi.toLowerCase();
  let found: RetractionStatus = { status: "none" };
  for (const item of items) {
    for (const u of item["update-to"] ?? []) {
      if ((u.DOI ?? "").toLowerCase() !== target) continue;
      const t = (u.type ?? "").toLowerCase();
      if (["retraction", "withdrawal", "removal"].includes(t)) {
        return { status: "retracted", noticeDoi: item.DOI, label: u.label || "Retraction" };
      }
      if (t === "expression_of_concern") {
        found = { status: "concern", noticeDoi: item.DOI, label: u.label || "Expression of Concern" };
      } else if (found.status === "none" && ["correction", "erratum", "corrigendum"].includes(t)) {
        found = { status: "correction", noticeDoi: item.DOI, label: u.label || "Correction" };
      }
    }
  }
  return found;
}

/* ---------------- OpenAlex (단건·필터 조회 위주 — 크레딧 절약) ---------------- */

interface OpenAlexWork {
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  type?: string;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string; type?: string } };
  is_retracted?: boolean;
}

const OPENALEX_SELECT = "doi,title,display_name,publication_year,type,authorships,primary_location";

function openalexToRecord(w: OpenAlexWork): SourceRecord | null {
  const title = (w.display_name || w.title)?.trim();
  if (!title) return null;
  const doi = w.doi?.replace(/^https?:\/\/doi\.org\//, "");
  const journal = w.primary_location?.source?.display_name;
  return {
    source: "openalex",
    doi,
    title,
    authors: (w.authorships ?? [])
      .map((a) => splitDisplayName(a.author?.display_name ?? ""))
      .filter((a): a is RecordAuthor => a !== null),
    year: w.publication_year,
    journal,
    url: doi ? `https://doi.org/${doi}` : undefined,
    type: w.type,
    isPreprint:
      w.type === "preprint" ||
      w.primary_location?.source?.type === "repository" ||
      /arxiv|biorxiv|medrxiv|ssrn|preprint/i.test(journal ?? ""),
  };
}

export async function openalexByDoi(doi: string): Promise<SourceRecord | null> {
  const json = (await fetchJson(
    `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=${OPENALEX_SELECT}&mailto=${MAILTO}`
  )) as OpenAlexWork | null;
  return json ? openalexToRecord(json) : null;
}

/**
 * OpenAlex 제목 검색 — title.search 필터(리스트 요청)로 Crossref에 없는
 * 학회 논문(NeurIPS 등) 커버. CORS 완전 지원이라 브라우저에서 동작.
 */
export async function openalexTitleSearch(title: string): Promise<SourceRecord[]> {
  const q = encodeURIComponent(title.slice(0, 250).replace(/[,|&]/g, " "));
  const json = (await fetchJson(
    `https://api.openalex.org/works?filter=title.search:${q}&per-page=5&select=${OPENALEX_SELECT}&mailto=${MAILTO}`
  )) as { results?: OpenAlexWork[] } | null;
  return (json?.results ?? [])
    .map(openalexToRecord)
    .filter((r): r is SourceRecord => r !== null);
}

/**
 * 저자 이름 + 연도(±1) 폴백 검색 — AI가 제목을 변형해 지어낸 인용(제목 검색 불가)을
 * "같은 저자의 유사 논문"으로나마 찾아내기 위한 최후 수단.
 */
export async function openalexAuthorYearSearch(
  authorName: string,
  year?: number
): Promise<SourceRecord[]> {
  const name = encodeURIComponent(authorName.replace(/[.,|&]/g, " ").trim().slice(0, 100));
  const yearFilter = year ? `,publication_year:${year - 1}|${year}|${year + 1}` : "";
  const json = (await fetchJson(
    `https://api.openalex.org/works?filter=raw_author_name.search:${name}${yearFilter}&per-page=50&select=${OPENALEX_SELECT}&mailto=${MAILTO}`
  )) as { results?: OpenAlexWork[] } | null;
  return (json?.results ?? [])
    .map(openalexToRecord)
    .filter((r): r is SourceRecord => r !== null);
}

/** OpenAlex 자체 철회 플래그 (보조 신호) */
export async function openalexRetractedFlag(doi: string): Promise<boolean | null> {
  try {
    const json = (await fetchJson(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=is_retracted&mailto=${MAILTO}`
    )) as { is_retracted?: boolean } | null;
    return json?.is_retracted ?? null;
  } catch {
    return null;
  }
}

/* ---------------- Semantic Scholar (키 없는 공유 풀 — 보조 소스) ---------------- */

interface S2Paper {
  title?: string;
  year?: number;
  venue?: string;
  authors?: { name?: string }[];
  externalIds?: { DOI?: string; ArXiv?: string };
}

// 키 없는 공유 풀은 동시 요청에 민감 — S2 호출은 전역 직렬화 + 간격 유지
let s2Queue: Promise<unknown> = Promise.resolve();
function s2Enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = s2Queue.then(task);
  s2Queue = run.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100))
  );
  return run;
}

export async function s2TitleMatch(query: string): Promise<SourceRecord | null> {
  const q = encodeURIComponent(query.slice(0, 300));
  let json: { data?: S2Paper[] } | null = null;
  try {
    // 브라우저에서는 이 엔드포인트가 CORS를 막으므로 즉시 실패 → null (보조 소스로만 동작)
    const tries = typeof window === "undefined" ? 4 : 1;
    json = (await s2Enqueue(() =>
      fetchJson(
        `https://api.semanticscholar.org/graph/v1/paper/search/match?query=${q}&fields=title,year,venue,authors,externalIds`,
        tries
      )
    )) as { data?: S2Paper[] } | null;
  } catch {
    return null; // 공유 풀 불안정 — 실패해도 파이프라인은 계속
  }
  const p = json?.data?.[0];
  if (!p?.title) return null;
  const venue = p.venue;
  return {
    source: "semanticscholar",
    doi: p.externalIds?.DOI,
    title: p.title,
    authors: (p.authors ?? [])
      .map((a) => splitDisplayName(a.name ?? ""))
      .filter((a): a is RecordAuthor => a !== null),
    year: p.year,
    journal: venue,
    url: p.externalIds?.DOI
      ? `https://doi.org/${p.externalIds.DOI}`
      : p.externalIds?.ArXiv
        ? `https://arxiv.org/abs/${p.externalIds.ArXiv}`
        : undefined,
    isPreprint: !p.externalIds?.DOI && (!venue || /arxiv/i.test(venue)),
  };
}
