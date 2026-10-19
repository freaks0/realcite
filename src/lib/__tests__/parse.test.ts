import { describe, expect, it } from "vitest";
import { detectFormat, extractDoi, parseReferences, splitAuthorNames } from "../parse";
import { extractSurname } from "../similarity";

const PLAINTEXT = `[1] Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). "Attention is all you need." Advances in Neural Information Processing Systems, 30.
[2] Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. NAACL-HLT. https://doi.org/10.18653/v1/N19-1423
[3] Smith, J., & Johnson, K. (2021). "Quantum neural fusion networks for sentiment-aware blockchain analytics." Journal of Advanced Computational Metaphysics, 14(3), 221-240.`;

const BIBTEX = `@inproceedings{devlin2019bert,
  title = {{BERT}: Pre-training of Deep Bidirectional Transformers for Language Understanding},
  author = {Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina},
  booktitle = {NAACL-HLT},
  year = {2019},
  doi = {10.18653/v1/N19-1423}
}`;

const RIS = `TY  - JOUR
AU  - Jumper, John
AU  - Evans, Richard
TI  - Highly accurate protein structure prediction with AlphaFold
JO  - Nature
PY  - 2021
DO  - 10.1038/s41586-021-03819-2
ER  -`;

describe("extractDoi", () => {
  it("URL 형태와 doi: 접두어에서 DOI를 꺼내고 끝의 문장부호를 뗀다", () => {
    expect(extractDoi("https://doi.org/10.18653/v1/N19-1423")).toBe("10.18653/v1/N19-1423");
    expect(extractDoi("doi:10.1016/S0140-6736(97)11096-0.")).toBe("10.1016/S0140-6736(97)11096-0");
  });

  it("DOI가 없으면 undefined", () => {
    expect(extractDoi("Smith, J. (2021). No identifier here.")).toBeUndefined();
  });
});

describe("detectFormat", () => {
  it("BibTeX, RIS, 플레인텍스트를 구분한다", () => {
    expect(detectFormat(BIBTEX)).toBe("bibtex");
    expect(detectFormat(RIS)).toBe("ris");
    expect(detectFormat(PLAINTEXT)).toBe("plaintext");
  });
});

describe("parseReferences: 플레인텍스트", () => {
  const refs = parseReferences(PLAINTEXT);

  it("[n] 번호 목록을 항목 단위로 나눈다", () => {
    expect(refs).toHaveLength(3);
    expect(refs.every((r) => r.format === "plaintext")).toBe(true);
  });

  it("따옴표로 감싼 제목과 연도, 저자 성을 뽑는다", () => {
    expect(refs[0].title).toBe("Attention is all you need");
    expect(refs[0].year).toBe(2017);
    expect(refs[0].authors).toEqual(["Vaswani", "Shazeer", "Parmar"]);
    expect(refs[0].firstAuthorFull).toBe("A. Vaswani");
  });

  it("APA 스타일(연도 뒤 제목)과 DOI URL을 처리한다", () => {
    expect(refs[1].doi).toBe("10.18653/v1/N19-1423");
    expect(refs[1].title).toBe(
      "BERT: Pre-training of deep bidirectional transformers for language understanding"
    );
    expect(refs[1].authors).toEqual(["Devlin", "Chang", "Lee", "Toutanova"]);
  });

  it("DOI가 없는 항목은 doi가 undefined", () => {
    expect(refs[2].doi).toBeUndefined();
    expect(refs[2].year).toBe(2021);
  });

  it("항목이 한 줄뿐이어도 [n] 번호는 뗀다", () => {
    const [ref] = parseReferences('[7] Smith, J. (2021). "A single pasted citation." Journal, 1(1).');
    expect(ref.raw.startsWith("Smith, J.")).toBe(true);
    expect(ref.firstAuthorFull).toMatch(/^J\.? Smith$/);
  });
});

describe("parseReferences: BibTeX", () => {
  it("중첩 중괄호가 든 제목, and로 이어진 저자, booktitle을 읽는다", () => {
    const [ref] = parseReferences(BIBTEX);
    expect(ref.format).toBe("bibtex");
    expect(ref.title).toBe(
      "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding"
    );
    expect(ref.authors).toEqual(["Devlin", "Chang", "Lee", "Toutanova"]);
    expect(ref.journal).toBe("NAACL-HLT");
    expect(ref.year).toBe(2019);
    expect(ref.doi).toBe("10.18653/v1/N19-1423");
  });
});

describe("parseReferences: RIS", () => {
  it("AU, TI, JO, PY, DO 태그를 읽는다", () => {
    const [ref] = parseReferences(RIS);
    expect(ref.format).toBe("ris");
    expect(ref.title).toBe("Highly accurate protein structure prediction with AlphaFold");
    expect(ref.authors).toEqual(["Jumper", "Evans"]);
    expect(ref.journal).toBe("Nature");
    expect(ref.year).toBe(2021);
    expect(ref.doi).toBe("10.1038/s41586-021-03819-2");
  });
});

describe("splitAuthorNames", () => {
  it("성, 이니셜 순서의 목록을 이름 단위로 재조립한다", () => {
    expect(splitAuthorNames("Kim, J., & Lee, S.").map(extractSurname)).toEqual(["Kim", "Lee"]);
  });

  it("이름 성 순서의 전체 이름은 그대로 둔다", () => {
    expect(splitAuthorNames("Sangkeum Lee")).toEqual(["Sangkeum Lee"]);
  });

  it("et al.은 버린다", () => {
    expect(splitAuthorNames("Wakefield, A.J., et al.").map(extractSurname)).toEqual(["Wakefield"]);
  });
});
