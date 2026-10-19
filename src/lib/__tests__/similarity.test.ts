import { describe, expect, it } from "vitest";
import { containment, extractSurname, normalize, surnameInText, titleSimilarity } from "../similarity";

describe("titleSimilarity", () => {
  it("대소문자, 문장부호, 불용어 차이는 무시한다", () => {
    expect(titleSimilarity("Attention Is All You Need", "attention is all you need.")).toBe(1);
  });

  it("영국식 철자를 미국식으로 맞춘다", () => {
    expect(normalize("Bayesian Optimisation")).toBe(normalize("Bayesian Optimization"));
  });

  it("전혀 다른 제목은 0에 가깝다", () => {
    const s = titleSimilarity(
      "Quantum neural fusion networks for sentiment-aware blockchain analytics",
      "Attention is all you need"
    );
    expect(s).toBeLessThan(0.1);
  });

  it("빈 문자열은 0", () => {
    expect(titleSimilarity("", "Attention is all you need")).toBe(0);
  });
});

describe("containment", () => {
  it("후보 제목의 토큰이 원문에 모두 있으면 1", () => {
    const raw =
      'Vaswani, A., et al. (2017). "Attention is all you need." Advances in Neural Information Processing Systems, 30.';
    expect(containment("Attention is all you need", raw)).toBe(1);
  });

  it("중복 토큰이 점수를 부풀리지 않는다", () => {
    // 고유 토큰 {peer, trading} 중 peer만 있음 → 0.5 (중복을 세면 4/5가 된다)
    expect(containment("peer-to-peer peer-to-peer trading", "peer to peer energy")).toBe(0.5);
  });
});

describe("extractSurname", () => {
  it("쉼표 앞, 마지막 토큰, 이니셜 앞 토큰 순으로 성을 고른다", () => {
    expect(extractSurname("Kim, J.")).toBe("Kim");
    expect(extractSurname("Jane Kim")).toBe("Kim");
    expect(extractSurname("Kim J.")).toBe("Kim");
    expect(extractSurname("{Vaswani}")).toBe("Vaswani");
  });
});

describe("surnameInText", () => {
  it("성이 토큰으로 등장하는지 본다", () => {
    expect(surnameInText("Lee", "Sangkeum Lee, Blind reset (2026)")).toBe(true);
    expect(surnameInText("Lee", "Leeds University Press")).toBe(false);
  });
});
