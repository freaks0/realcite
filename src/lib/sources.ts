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

/* ---------------- DataCite (무키·무제한·CORS — arXiv 등 저장소 DOI 전체 커버) ---------------- */

interface DataCiteDoi {
  id?: string;
  attributes?: {
    doi?: string;
    titles?: { title?: string }[];
    creators?: { name?: string; givenName?: string; familyName?: string }[];
    publicationYear?: number;
    publisher?: string;
    container?: { title?: string };
    types?: { resourceTypeGeneral?: string };
    url?: string;
  };
}

function dataciteToRecord(d: DataCiteDoi): SourceRecord | null {
  const a = d.attributes;
  const title = a?.titles?.[0]?.title?.replace(/\s+/g, " ").trim();
  if (!a || !title) return null;
  const doi = (a.doi ?? d.id)?.toLowerCase();
  const authors: RecordAuthor[] = [];
  for (const c of a.creators ?? []) {
    if (c.familyName) authors.push({ family: c.familyName, given: c.givenName });
    else if (c.name) {
      // DataCite name은 "Family, Given" 형식이 흔함
      const comma = c.name.includes(",")
        ? { family: c.name.split(",")[0].trim(), given: c.name.split(",")[1]?.trim() }
        : splitDisplayName(c.name);
      if (comma?.family) authors.push(comma);
    }
  }
  const journal = a.container?.title || a.publisher;
  return {
    source: "datacite",
    doi,
    title,
    authors,
    year: a.publicationYear,
    journal,
    url: doi ? `https://doi.org/${doi}` : a.url,
    type: a.types?.resourceTypeGeneral,
    isPreprint:
      a.types?.resourceTypeGeneral === "Preprint" ||
      /arxiv|zenodo|preprint/i.test(journal ?? "") ||
      (doi ?? "").startsWith("10.48550/"),
  };
}

export async function dataciteByDoi(doi: string): Promise<SourceRecord | null> {
  const json = (await fetchJson(
    `https://api.datacite.org/dois/${encodeURIComponent(doi)}`
  )) as { data?: DataCiteDoi } | null;
  return json?.data ? dataciteToRecord(json.data) : null;
}

export async function dataciteTitleSearch(title: string): Promise<SourceRecord[]> {
  const q = encodeURIComponent(`titles.title:"${title.slice(0, 200).replace(/"/g, "")}"`);
  const json = (await fetchJson(
    `https://api.datacite.org/dois?query=${q}&page%5Bsize%5D=5`
  )) as { data?: DataCiteDoi[] } | null;
  return (json?.data ?? [])
    .map(dataciteToRecord)
    .filter((r): r is SourceRecord => r !== null);
}

/* ---------------- Europe PMC (무키·CORS — 의생명 + 프리프린트) ---------------- */

interface EuropePmcResult {
  title?: string;
  authorString?: string;
  pubYear?: string;
  journalTitle?: string;
  doi?: string;
  source?: string;
}

export async function europePmcTitleSearch(title: string): Promise<SourceRecord[]> {
  const q = encodeURIComponent(`TITLE:"${title.slice(0, 200).replace(/"/g, "")}"`);
  const json = (await fetchJson(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=5`
  )) as { resultList?: { result?: EuropePmcResult[] } } | null;
  const out: SourceRecord[] = [];
  for (const r of json?.resultList?.result ?? []) {
    if (!r.title) continue;
    out.push({
      source: "europepmc",
      doi: r.doi,
      title: r.title.replace(/\.$/, ""),
      authors: (r.authorString ?? "")
        .split(/,\s*/)
        .flatMap((n): RecordAuthor[] => {
          // "Jumper J" 형식: 앞이 성
          const parts = n.replace(/\.$/, "").trim().split(/\s+/);
          if (!parts[0]) return [];
          return [{ family: parts[0], given: parts.slice(1).join(" ") || undefined }];
        }),
      year: r.pubYear ? parseInt(r.pubYear, 10) || undefined : undefined,
      journal: r.journalTitle,
      url: r.doi ? `https://doi.org/${r.doi}` : undefined,
      isPreprint: r.source === "PPR",
    });
  }
  return out;
}

/* ---------------- OpenAlex (단건 조회는 무료, 검색은 일일 한도 — 한도 시 즉시 스킵) ---------------- */

let oaSearchExhausted = false;
let oaApiKey = "";

/**
 * 사용자 본인의 OpenAlex API 키 설정 (선택).
 * 키 없이는 IP당 일 $0.10, 무료 계정 키($1/일)를 넣으면 한도가 10배로 늘어남.
 * 키는 브라우저(localStorage)에만 저장되고 api.openalex.org로만 전송됨.
 */
export function setOpenalexApiKey(key: string): void {
  oaApiKey = key.trim();
  if (oaApiKey) oaSearchExhausted = false; // 키가 생겼으면 차단 해제 후 재시도 허용
}

function oaKeyParam(): string {
  return oaApiKey ? `&api_key=${encodeURIComponent(oaApiKey)}` : "";
}

/** 검색(리스트/필터) 전용 fetch: 429(일일 예산 소진)면 세션 내 재시도 없이 즉시 차단 */
async function oaSearchFetch(url: string): Promise<unknown | null> {
  if (oaSearchExhausted) throw new Error("OpenAlex 검색 일일 무료 한도 소진");
  const res = await fetch(url + oaKeyParam(), { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (res.status === 429) {
    oaSearchExhausted = true;
    throw new Error("OpenAlex 검색 일일 무료 한도 소진");
  }
  if (!res.ok) throw new Error(`OpenAlex 오류 ${res.status}`);
  return res.json();
}

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
    `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=${OPENALEX_SELECT}&mailto=${MAILTO}${oaKeyParam()}`
  )) as OpenAlexWork | null;
  return json ? openalexToRecord(json) : null;
}

/**
 * OpenAlex 제목 검색 — title.search 필터(리스트 요청)로 Crossref에 없는
 * 학회 논문(NeurIPS 등) 커버. CORS 완전 지원이라 브라우저에서 동작.
 */
export async function openalexTitleSearch(title: string): Promise<SourceRecord[]> {
  const q = encodeURIComponent(title.slice(0, 250).replace(/[,|&]/g, " "));
  const json = (await oaSearchFetch(
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
  // 인용 연도 자체가 틀린 경우가 흔해 ±2년까지 포용
  const yearFilter = year
    ? `,publication_year:${[-2, -1, 0, 1, 2].map((d) => year + d).join("|")}`
    : "";
  const json = (await oaSearchFetch(
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
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=is_retracted&mailto=${MAILTO}${oaKeyParam()}`
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

/**
 * 브라우저에서는 자체 프록시(Cloudflare Worker) 경유.
 * S2는 429 응답에 CORS 헤더를 빼먹어 브라우저에서 재시도가 불가능한데,
 * 프록시가 모든 응답에 CORS를 붙여주고 성공 응답을 10분 캐시해 한도도 아껴줌.
 */
const S2_BASE =
  typeof window === "undefined"
    ? "https://api.semanticscholar.org"
    : "https://citeguard-proxy.citeguard.workers.dev/s2";

export async function s2TitleMatch(query: string): Promise<SourceRecord | null> {
  const q = encodeURIComponent(query.slice(0, 300));
  let json: { data?: S2Paper[] } | null = null;
  try {
    json = (await s2Enqueue(() =>
      fetchJson(
        `${S2_BASE}/graph/v1/paper/search/match?query=${q}&fields=title,year,venue,authors,externalIds`,
        4
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
