import { describe, expect, it } from "vitest";
import { formatCitation } from "../citestyles";
import { toBibtex } from "../bibtex";
import type { SourceRecord } from "../types";

const bert: SourceRecord = {
  source: "crossref",
  doi: "10.18653/v1/N19-1423",
  title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
  authors: [
    { family: "Devlin", given: "Jacob" },
    { family: "Chang", given: "Ming-Wei" },
    { family: "Lee", given: "Kenton" },
    { family: "Toutanova", given: "Kristina" },
  ],
  year: 2019,
  journal: "Proceedings of NAACL-HLT 2019",
  type: "proceedings-article",
};

const preprint: SourceRecord = {
  source: "arxiv",
  title: "Adam: A Method for Stochastic Optimization",
  authors: [
    { family: "Kingma", given: "Diederik P." },
    { family: "Ba", given: "Jimmy" },
  ],
  url: "https://arxiv.org/abs/1412.6980",
  isPreprint: true,
};

describe("toBibtex", () => {
  it("학회 논문은 @inproceedings와 booktitle로, 키는 저자+연도+제목 첫 단어", () => {
    const bib = toBibtex(bert);
    expect(bib.startsWith("@inproceedings{devlin2019bert,")).toBe(true);
    expect(bib).toContain("  booktitle = {Proceedings of NAACL-HLT 2019}");
    expect(bib).toContain(
      "  author = {Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina}"
    );
    expect(bib).toContain("  doi = {10.18653/v1/N19-1423}");
    expect(bib).not.toContain("note = {Preprint}");
  });

  it("프리프린트는 note를 붙이고 DOI 대신 url을 쓴다", () => {
    const bib = toBibtex(preprint);
    expect(bib).toContain("  url = {https://arxiv.org/abs/1412.6980}");
    expect(bib).toContain("  note = {Preprint}");
    expect(bib).not.toContain("doi =");
  });
});

describe("formatCitation", () => {
  it("APA 7: 성, 이니셜 목록과 마지막 저자 앞 &", () => {
    expect(formatCitation(bert, "apa")).toBe(
      "Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. Proceedings of NAACL-HLT 2019. https://doi.org/10.18653/v1/N19-1423"
    );
  });

  it("IEEE: 이니셜 성 순서, 따옴표 제목, doi: 표기", () => {
    expect(formatCitation(bert, "ieee")).toBe(
      'J. Devlin, M. W. Chang, K. Lee and K. Toutanova, "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding," Proceedings of NAACL-HLT 2019, 2019. doi: 10.18653/v1/N19-1423.'
    );
  });

  it("MLA 9: 저자 셋 이상이면 et al. (마침표 중복 없음)", () => {
    expect(formatCitation(bert, "mla")).toBe(
      'Devlin, Jacob, et al. "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding." Proceedings of NAACL-HLT 2019, 2019. https://doi.org/10.18653/v1/N19-1423.'
    );
  });

  it("Vancouver: 이니셜에 마침표 없음", () => {
    const s = formatCitation(bert, "vancouver");
    expect(s.startsWith("Devlin J, Chang MW, Lee K, Toutanova K. ")).toBe(true);
    expect(s.endsWith("doi:10.18653/v1/N19-1423")).toBe(true);
  });

  it("Chicago: 첫 저자만 성, 이름 순서이고 and는 마지막 저자 앞", () => {
    expect(formatCitation(bert, "chicago")).toBe(
      'Devlin, Jacob, Ming-Wei Chang, Kenton Lee, and Kristina Toutanova. 2019. "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding." Proceedings of NAACL-HLT 2019. https://doi.org/10.18653/v1/N19-1423.'
    );
    expect(formatCitation(preprint, "chicago").startsWith("Kingma, Diederik P., and Jimmy Ba. n.d.")).toBe(
      true
    );
  });

  it("Vancouver: 저자 7명 이상이면 6명 뒤 et al. (마침표 중복 없음)", () => {
    const many: SourceRecord = {
      ...bert,
      authors: Array.from({ length: 8 }, (_, i) => ({ family: `Author${i + 1}`, given: "A" })),
    };
    expect(
      formatCitation(many, "vancouver").startsWith(
        "Author1 A, Author2 A, Author3 A, Author4 A, Author5 A, Author6 A, et al. "
      )
    ).toBe(true);
  });

  it("연도와 저널이 없는 프리프린트는 n.d.와 arXiv preprint, url로 채운다", () => {
    expect(formatCitation(preprint, "apa")).toBe(
      "Kingma, D. P., & Ba, J. (n.d.). Adam: A Method for Stochastic Optimization. arXiv preprint. https://arxiv.org/abs/1412.6980"
    );
  });
});
