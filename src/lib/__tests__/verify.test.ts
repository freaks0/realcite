/**
 * 판정 로직 단위 테스트. 학술 API는 전부 모킹하므로 네트워크 없이 결정적으로 돈다.
 * 실제 API에 대한 회귀 확인은 scripts/smoke.ts가 담당한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceRecord } from "../types";

vi.mock("../sources", () => ({
  arxivTitleSearch: vi.fn(),
  crossrefByDoi: vi.fn(),
  crossrefRetractionCheck: vi.fn(),
  crossrefSearchBibliographic: vi.fn(),
  dataciteByDoi: vi.fn(),
  dataciteTitleSearch: vi.fn(),
  europePmcTitleSearch: vi.fn(),
  openalexAuthorYearSearch: vi.fn(),
  openalexByDoi: vi.fn(),
  openalexRetractedFlag: vi.fn(),
  openalexTitleSearch: vi.fn(),
  s2TitleMatch: vi.fn(),
}));

import * as sources from "../sources";
import { parseReferences } from "../parse";
import { verifyAll, verifyReference } from "../verify";

const api = vi.mocked(sources);

/** 기본값: 어느 소스도 아무것도 못 찾고, 장애도 없는 상태 */
function nothingFound() {
  api.crossrefByDoi.mockReset().mockResolvedValue(null);
  api.dataciteByDoi.mockReset().mockResolvedValue(null);
  api.openalexByDoi.mockReset().mockResolvedValue(null);
  api.crossrefSearchBibliographic.mockReset().mockResolvedValue([]);
  api.dataciteTitleSearch.mockReset().mockResolvedValue([]);
  api.europePmcTitleSearch.mockReset().mockResolvedValue([]);
  api.arxivTitleSearch.mockReset().mockResolvedValue([]);
  api.openalexTitleSearch.mockReset().mockResolvedValue([]);
  api.openalexAuthorYearSearch.mockReset().mockResolvedValue([]);
  api.s2TitleMatch.mockReset().mockResolvedValue(null);
  api.crossrefRetractionCheck.mockReset().mockResolvedValue({ status: "none" });
  api.openalexRetractedFlag.mockReset().mockResolvedValue(false);
}

const ref = (line: string) => parseReferences(line)[0];

const BERT_LINE =
  "[1] Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. NAACL-HLT. https://doi.org/10.18653/v1/N19-1423";
const FAKE_LINE =
  '[2] Smith, J., & Johnson, K. (2021). "Quantum neural fusion networks for sentiment-aware blockchain analytics." Journal of Advanced Computational Metaphysics, 14(3), 221-240.';
const WAKEFIELD_LINE =
  "[3] Wakefield, A.J., et al. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351(9103), 637-641. doi:10.1016/S0140-6736(97)11096-0";

const bertRec: SourceRecord = {
  source: "crossref",
  doi: "10.18653/v1/n19-1423",
  title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
  authors: [
    { family: "Devlin", given: "Jacob" },
    { family: "Chang", given: "Ming-Wei" },
    { family: "Lee", given: "Kenton" },
    { family: "Toutanova", given: "Kristina" },
  ],
  year: 2019,
  journal: "Proceedings of the 2019 Conference of the North American Chapter of the ACL",
  type: "proceedings-article",
};

const wakefieldRec: SourceRecord = {
  source: "crossref",
  doi: "10.1016/s0140-6736(97)11096-0",
  title:
    "Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children",
  authors: [{ family: "Wakefield", given: "AJ" }],
  year: 1998,
  journal: "The Lancet",
  type: "journal-article",
};

beforeEach(nothingFound);

describe("verifyReference: DOI 경로", () => {
  it("DOI가 해석되고 제목·저자·연도가 맞으면 exact", async () => {
    api.crossrefByDoi.mockResolvedValue(bertRec);
    const r = await verifyReference(ref(BERT_LINE));
    expect(r.verdict).toBe("exact");
    expect(r.matched?.doi).toBe(bertRec.doi);
    expect(r.comparisons.every((c) => c.match)).toBe(true);
    expect(r.sourcesChecked).toContain("Crossref (DOI)");
    expect(api.crossrefSearchBibliographic).not.toHaveBeenCalled();
  });

  it("같은 논문이지만 연도가 다르면 minor와 교정값", async () => {
    api.crossrefByDoi.mockResolvedValue({ ...bertRec, year: 2023 });
    const r = await verifyReference(ref(BERT_LINE));
    expect(r.verdict).toBe("minor");
    const year = r.comparisons.find((c) => c.field === "year");
    expect(year).toMatchObject({ match: false, inputValue: "2019", foundValue: "2023" });
  });

  it("DOI가 전혀 다른 논문을 가리키면 실존으로 보지 않는다 (DOI 도용)", async () => {
    api.crossrefByDoi.mockResolvedValue(bertRec);
    const spoofed = ref(`${FAKE_LINE} https://doi.org/10.18653/v1/N19-1423`);
    const r = await verifyReference(spoofed);
    expect(r.verdict).toBe("major");
    expect(r.matched).toBeUndefined();
    expect(r.nearestMiss?.doi).toBe(bertRec.doi);
    expect(r.reason).toContain("전혀 다른 논문");
    expect(api.crossrefSearchBibliographic).toHaveBeenCalled();
  });

  it("Crossref에 없는 DOI는 DataCite, OpenAlex 순으로 넘어간다", async () => {
    api.dataciteByDoi.mockResolvedValue(bertRec);
    const r = await verifyReference(ref(BERT_LINE));
    expect(r.verdict).toBe("exact");
    expect(r.sourcesChecked).toEqual(["Crossref (DOI)", "DataCite (DOI)"]);
    expect(api.openalexByDoi).not.toHaveBeenCalled();
  });

  it("철회된 논문은 실존이라도 철회 표시가 붙는다", async () => {
    api.crossrefByDoi.mockResolvedValue(wakefieldRec);
    api.crossrefRetractionCheck.mockResolvedValue({
      status: "retracted",
      noticeDoi: "10.1016/s0140-6736(10)60175-4",
      label: "Retraction",
    });
    const r = await verifyReference(ref(WAKEFIELD_LINE));
    expect(r.verdict).toBe("exact");
    expect(r.retraction.status).toBe("retracted");
  });
});

describe("verifyReference: 검색 경로", () => {
  it("어느 소스에서도 못 찾으면 major, 조회 소스를 전부 기록한다", async () => {
    const r = await verifyReference(ref(FAKE_LINE));
    expect(r.verdict).toBe("major");
    expect(r.matched).toBeUndefined();
    expect(r.nearestMiss).toBeUndefined();
    expect(r.sourcesChecked.slice(0, 6)).toEqual([
      "Crossref (서지 검색)",
      "DataCite (제목 검색)",
      "Europe PMC",
      "arXiv",
      "OpenAlex (제목 검색)",
      "Semantic Scholar",
    ]);
    // 1저자, 마지막 저자 순으로 저자 검색 폴백. 입력의 [n] 번호가 저자 이름에 섞이면 안 된다
    expect(r.sourcesChecked[6]).toBe("OpenAlex (저자 검색: J. Smith)");
    expect(r.sourcesChecked[7]).toMatch(/^OpenAlex \(저자 검색: K\.? Johnson\)$/);
    expect(r.sourcesChecked).toHaveLength(8);
  });

  it("소스 장애로 못 찾은 것은 조작 의심이 아니라 확인 불가(error)", async () => {
    api.crossrefSearchBibliographic.mockRejectedValue(new Error("요청 실패: api.crossref.org"));
    const r = await verifyReference(ref(FAKE_LINE));
    expect(r.verdict).toBe("error");
    expect(r.verdict).not.toBe("major");
    expect(r.reason).toContain("보류");
    expect(r.reason).toContain("Crossref (서지 검색)");
  });

  it("제목이 맞고 저자가 반증되지 않으면 서지 검색만으로 exact", async () => {
    api.crossrefSearchBibliographic.mockResolvedValue([bertRec]);
    const r = await verifyReference(ref(BERT_LINE.replace(/ https:\/\/doi\.org\S+$/, "")));
    expect(r.verdict).toBe("exact");
    expect(r.matched?.doi).toBe(bertRec.doi);
    // 확신 수준이면 다른 소스는 더 부르지 않는다
    expect(api.openalexTitleSearch).not.toHaveBeenCalled();
    expect(api.s2TitleMatch).not.toHaveBeenCalled();
  });

  it("제목 일부가 겹쳐도 저자가 다르면 같은 논문으로 내놓지 않는다", async () => {
    const lookalike: SourceRecord = {
      source: "crossref",
      doi: "10.1000/other",
      title: "Neural networks for sentiment analysis",
      authors: [{ family: "Garcia", given: "M." }],
      year: 2021,
      journal: "Some Journal",
    };
    api.crossrefSearchBibliographic.mockResolvedValue([lookalike]);
    const r = await verifyReference(ref(FAKE_LINE));
    expect(r.verdict).toBe("major");
    expect(r.matched).toBeUndefined();
    expect(r.nearestMiss?.title).toBe(lookalike.title);
  });

  it("제목 검색은 실패해도 같은 저자·연도의 유사 논문이 있으면 uncertain", async () => {
    const similar: SourceRecord = {
      source: "openalex",
      doi: "10.1000/ancilla",
      title: "Blind reset of ancilla qubits in variational quantum circuits",
      authors: [{ family: "Lee", given: "Sangkeum" }],
      year: 2026,
      journal: "Discover Quantum Science",
    };
    api.openalexAuthorYearSearch.mockResolvedValue([similar]);
    const r = await verifyReference(
      ref(
        '[5] Sangkeum Lee, "Blind reset recycles ancilla qubits for variational quantum workloads," Discover Quantum Science, 2026.'
      )
    );
    expect(r.verdict).toBe("uncertain");
    expect(r.matched?.title).toBe(similar.title);
    expect(r.reason).toContain("유사 논문");
    expect(api.openalexAuthorYearSearch).toHaveBeenCalledWith("Sangkeum Lee", 2026);
  });
});

describe("verifyAll", () => {
  it("입력 순서를 유지하고 진행 콜백을 건별로 부른다", async () => {
    api.crossrefByDoi.mockResolvedValue(bertRec);
    const refs = parseReferences(`${BERT_LINE}\n${FAKE_LINE}\n${WAKEFIELD_LINE}`);
    const progress: number[] = [];
    const results = await verifyAll(refs, (done) => progress.push(done));
    expect(results.map((r) => r.verdict)).toEqual(["exact", "major", "major"]);
    expect(results.map((r) => r.ref.raw)).toEqual(refs.map((r) => r.raw));
    expect(progress).toEqual([1, 2, 3]);
  });
});
