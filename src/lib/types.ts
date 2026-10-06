/** 입력에서 파싱된 참고문헌 한 건 */
export interface ParsedReference {
  /** 입력 원문 (해당 항목 부분) */
  raw: string;
  doi?: string;
  title?: string;
  /** 저자 성(surname) 목록 */
  authors?: string[];
  year?: number;
  journal?: string;
  /** 파싱된 입력 형식 */
  format: "bibtex" | "ris" | "plaintext";
}

/** 학술 DB에서 찾은 레코드 (소스 공통 정규화 형태) */
export interface SourceRecord {
  source: "crossref" | "openalex" | "semanticscholar";
  doi?: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  url?: string;
  type?: string;
}

export type Verdict = "exact" | "minor" | "major" | "error";

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
  /** 매칭된 실제 레코드 (major면 undefined) */
  matched?: SourceRecord;
  /** 매칭 신뢰도 0~1 */
  confidence: number;
  comparisons: FieldComparison[];
  retraction: RetractionStatus;
  /** 조회를 시도한 소스 목록 (근거 투명성) */
  sourcesChecked: string[];
  /** 판정 사유 한 줄 */
  reason: string;
  /** 교정된 BibTeX (matched가 있을 때) */
  correctedBibtex?: string;
  error?: string;
}

export interface VerificationProgress {
  done: number;
  total: number;
}
