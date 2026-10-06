import type {
  FieldComparison,
  ParsedReference,
  RetractionStatus,
  SourceRecord,
  VerificationResult,
} from "./types";
import {
  crossrefByDoi,
  crossrefRetractionCheck,
  crossrefSearchBibliographic,
  openalexByDoi,
  openalexRetractedFlag,
  openalexTitleSearch,
  s2TitleMatch,
} from "./sources";
import { containment, normalize, titleSimilarity } from "./similarity";
import { toBibtex } from "./bibtex";

/** 후보 레코드가 입력과 얼마나 맞는지 제목 기준 점수 (0~1) */
function titleScore(ref: ParsedReference, rec: SourceRecord): number {
  const scores: number[] = [0];
  if (ref.title) scores.push(titleSimilarity(ref.title, rec.title));
  // 플레인텍스트는 제목 추정이 틀릴 수 있어 원문 포함도도 함께 봄
  if (ref.format === "plaintext") scores.push(containment(rec.title, ref.raw));
  return Math.max(...scores);
}

function yearMatches(ref: ParsedReference, rec: SourceRecord): boolean | null {
  if (!ref.year || !rec.year) return null;
  // 온라인 공개/지면 출판 연도 차이는 흔하므로 ±1 허용
  return Math.abs(ref.year - rec.year) <= 1;
}

function authorMatches(ref: ParsedReference, rec: SourceRecord): boolean | null {
  if (rec.authors.length === 0) return null;
  const recSurnames = rec.authors.map((a) => normalize(a));
  if (ref.authors && ref.authors.length > 0) {
    const inputSurnames = ref.authors.map((a) => normalize(a));
    // 입력 1저자가 레코드 저자 목록에 있으면 일치로 간주
    return recSurnames.some((s) => inputSurnames.includes(s));
  }
  // 플레인텍스트: 레코드 1저자 성이 입력 원문에 등장하는지
  const rawNorm = ` ${normalize(ref.raw)} `;
  return recSurnames.slice(0, 3).some((s) => s.length > 1 && rawNorm.includes(` ${s} `));
}

function buildComparisons(ref: ParsedReference, rec: SourceRecord): FieldComparison[] {
  const comps: FieldComparison[] = [];
  const ts = titleScore(ref, rec);
  comps.push({
    field: "title",
    inputValue: ref.title ?? "(원문에서 추정)",
    foundValue: rec.title,
    match: ts >= (ref.format === "plaintext" ? 0.7 : 0.85),
  });
  const am = authorMatches(ref, rec);
  if (am !== null) {
    comps.push({
      field: "authors",
      inputValue: ref.authors?.join(", ") ?? "(원문에서 추정)",
      foundValue: rec.authors.join(", "),
      match: am,
    });
  }
  const ym = yearMatches(ref, rec);
  if (ym !== null) {
    comps.push({
      field: "year",
      inputValue: String(ref.year),
      foundValue: String(rec.year),
      match: ym,
    });
  }
  if (ref.journal && rec.journal) {
    const sim = Math.max(
      titleSimilarity(ref.journal, rec.journal),
      containment(rec.journal, ref.journal),
      containment(ref.journal, rec.journal)
    );
    comps.push({ field: "journal", inputValue: ref.journal, foundValue: rec.journal, match: sim >= 0.5 });
  }
  if (ref.doi && rec.doi && ref.doi.toLowerCase() !== rec.doi.toLowerCase()) {
    comps.push({ field: "doi", inputValue: ref.doi, foundValue: rec.doi, match: false });
  }
  return comps;
}

async function checkRetraction(rec: SourceRecord | undefined): Promise<RetractionStatus> {
  if (!rec?.doi) return { status: "none" };
  try {
    const cr = await crossrefRetractionCheck(rec.doi);
    if (cr.status !== "none") return cr;
    const oa = await openalexRetractedFlag(rec.doi);
    if (oa === true) return { status: "retracted", label: "Retracted (OpenAlex)" };
    return { status: "none" };
  } catch {
    return { status: "none" };
  }
}

/** 참고문헌 한 건 검증 */
export async function verifyReference(ref: ParsedReference): Promise<VerificationResult> {
  const sourcesChecked: string[] = [];
  const notes: string[] = [];

  try {
    let matched: SourceRecord | undefined;
    let viaDoi = false;

    // 1단계: DOI 해석 (Crossref → 실패 시 OpenAlex: arXiv 등 DataCite DOI 커버)
    if (ref.doi) {
      sourcesChecked.push("Crossref (DOI)");
      let rec = await crossrefByDoi(ref.doi);
      if (!rec) {
        sourcesChecked.push("OpenAlex (DOI)");
        rec = await openalexByDoi(ref.doi);
      }
      if (rec) {
        // DOI가 해석되어도 진짜라는 보장은 없음 — 제목이 입력과 맞는지 확인
        if (titleScore(ref, rec) >= 0.55) {
          matched = rec;
          viaDoi = true;
        } else {
          notes.push("입력된 DOI는 전혀 다른 논문을 가리킴");
        }
      } else {
        notes.push("입력된 DOI가 어느 DB에서도 해석되지 않음");
      }
    }

    // 2단계: 서지 문자열/제목 검색 (DOI 없거나 DOI 경로 실패)
    if (!matched) {
      // 제목은 같지만 연도·저자가 다른 동명 논문에 속지 않도록 불일치에 페널티
      const candScore = (cand: SourceRecord): number => {
        let score = titleScore(ref, cand);
        const ym = yearMatches(ref, cand);
        const am = authorMatches(ref, cand);
        if (ym === true) score += 0.05;
        else if (ym === false) score -= 0.2;
        if (am === true) score += 0.05;
        else if (am === false) score -= 0.1;
        return score;
      };

      sourcesChecked.push("Crossref (서지 검색)");
      const pool = await crossrefSearchBibliographic(ref.raw);
      const pickBest = (cands: SourceRecord[]): SourceRecord | undefined =>
        cands.reduce<SourceRecord | undefined>(
          (b, c) => (!b || candScore(c) > candScore(b) ? c : b),
          undefined
        );
      let best = pickBest(pool);

      // Crossref 최선 후보가 확신 수준이 아니면 다른 소스 교차 확인
      // (NeurIPS 등 Crossref에 DOI 미등록인 학회 논문 커버)
      if ((!best || candScore(best) < 0.9) && ref.title) {
        sourcesChecked.push("OpenAlex (제목 검색)");
        const oaPool = await openalexTitleSearch(ref.title);
        best = pickBest([...(best ? [best] : []), ...oaPool]);
      }
      if (!best || candScore(best) < 0.9) {
        sourcesChecked.push("Semantic Scholar");
        const s2 = await s2TitleMatch(ref.title ?? ref.raw);
        if (s2 && (!best || candScore(s2) > candScore(best))) best = s2;
      }

      if (best && titleScore(ref, best) >= 0.55) matched = best;
    }

    // 판정
    if (!matched) {
      return {
        ref,
        verdict: "major",
        confidence: 0.9,
        comparisons: [],
        retraction: { status: "none" },
        sourcesChecked,
        reason:
          (notes.length ? notes.join("; ") + ". " : "") +
          "조회한 모든 DB에서 일치하는 실존 문헌을 찾지 못함 — 조작(할루시네이션) 의심. 수동 확인 필요.",
      };
    }

    const comparisons = buildComparisons(ref, matched);
    const mismatches = comparisons.filter((c) => !c.match);
    const retraction = await checkRetraction(matched);
    const ts = titleScore(ref, matched);

    if (mismatches.length === 0 && (viaDoi || ts >= 0.85)) {
      return {
        ref,
        verdict: "exact",
        matched,
        confidence: viaDoi ? 0.95 : Math.min(ts, 0.9),
        comparisons,
        retraction,
        sourcesChecked,
        reason: viaDoi
          ? "DOI 해석 성공 + 메타데이터 필드 일치"
          : "서지 검색에서 고신뢰 일치 레코드 확인",
        correctedBibtex: toBibtex(matched),
      };
    }

    return {
      ref,
      verdict: "minor",
      matched,
      confidence: ts * 0.85,
      comparisons,
      retraction,
      sourcesChecked,
      reason:
        (notes.length ? notes.join("; ") + ". " : "") +
        (mismatches.length
          ? `실존 문헌으로 보이나 ${mismatches.map((m) => m.field).join(", ")} 필드 불일치 — 교정 필요`
          : "유사 문헌을 찾았으나 일치 신뢰도가 낮음 — 수동 확인 권장"),
      correctedBibtex: toBibtex(matched),
    };
  } catch (e) {
    return {
      ref,
      verdict: "error",
      confidence: 0,
      comparisons: [],
      retraction: { status: "none" },
      sourcesChecked,
      reason: "네트워크/API 오류로 검증하지 못함 — 다시 시도해 주세요.",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 전체 목록 검증 (동시 3건 제한 — 학술 API 예의) */
export async function verifyAll(
  refs: ParsedReference[],
  onProgress?: (done: number, total: number) => void
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = new Array(refs.length);
  let next = 0;
  let done = 0;
  const CONCURRENCY = 3;

  async function worker() {
    while (next < refs.length) {
      const i = next++;
      results[i] = await verifyReference(refs[i]);
      done++;
      onProgress?.(done, refs.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, refs.length) }, () => worker())
  );
  return results;
}
