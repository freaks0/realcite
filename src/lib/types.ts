/** 입력에서 파싱된 참고문헌 한 건 */
export interface ParsedReference {
  /** 입력 원문 (해당 항목 부분) */
  raw: string;
  doi?: string;
  title?: string;
  /** 저자 성(surname) 목록 */
  authors?: string[];
  /** 입력에서 추출한 저자 구간 원문 (표시용) */
  authorsRaw?: string;
  /** 1저자 전체 이름 (저자 기반 폴백 검색용) */
  firstAuthorFull?: string;
  /** 마지막 저자 전체 이름 (교신저자인 경우가 많아 폴백 검색에 유용) */
  lastAuthorFull?: string;
  year?: number;
  journal?: string;
  /** 파싱된 입력 형식 */
  format: "bibtex" | "ris" | "plaintext";
}

export interface RecordAuthor {
  family: string;
  given?: string;
}

/** 학술 DB에서 찾은 레코드 (소스 공통 정규화 형태) */
export interface SourceRecord {
  source: "crossref" | "openalex" | "semanticscholar" | "datacite" | "europepmc";
  doi?: string;
  title: string;
  authors: RecordAuthor[];
  year?: number;
  journal?: string;
  url?: string;
  type?: string;
  /** 프리프린트(arXiv 등 저장소 게재본) 여부 */
  isPreprint?: boolean;
}

export function authorSurnames(rec: SourceRecord): string[] {
  return rec.authors.map((a) => a.family).filter(Boolean);
}

export function formatAuthorList(rec: SourceRecord, max = 5): string {
  const names = rec.authors.map((a) => (a.given ? `${a.given} ${a.family}` : a.family));
  return names.slice(0, max).join(", ") + (names.length > max ? " 외" : "");
}

/**
 * exact  — 실존 + 메타데이터 일치
 * minor  — 같은 논문이나 일부 필드 오염 (제목은 일치)
 * uncertain — 유사 논문만 발견 (제목 불일치 — 의도한 논문인지 직접 확인 필요)
 * major  — 어느 DB에서도 못 찾음 (조작 의심)
 */
export type Verdict = "exact" | "minor" | "uncertain" | "major" | "error";

export interface FieldComparison {
  field: "title" | "authors" | "year" | "journal" | "doi";
  inputValue: string;
  foundValue: string;
  match: boolean;
}

export type RetractionStatus =
  | { status: "none" }
  | { status: "retracted" | "concern" | "correction"; noticeDoi?: string; label: string };

/** 참고문헌 한 건의 검증 결과 */
export interface VerificationResult {
  ref: ParsedReference;
  verdict: Verdict;
  /** 매칭된 실제 레코드 (exact/minor) 또는 유사 후보 (uncertain) */
  matched?: SourceRecord;
  /** major 판정 시, 기각됐지만 가장 비슷했던 검색 결과 (참고용 — 동일 논문 아님) */
  nearestMiss?: SourceRecord;
  /** 매칭 신뢰도 0~1 */
  confidence: number;
  comparisons: FieldComparison[];
  retraction: RetractionStatus;
  /** 조회를 시도한 소스 목록 (근거 투명성) */
  sourcesChecked: string[];
  /** 판정 사유 한 줄 */
  reason: string;
  error?: string;
}

export interface VerificationProgress {
  done: number;
  total: number;
}
