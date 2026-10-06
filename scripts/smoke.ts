/** 코어 검증 로직 스모크 테스트 — 실제 학술 API 호출 (node 22+, npx tsx scripts/smoke.ts) */
import { parseReferences } from "../src/lib/parse";
import { verifyAll } from "../src/lib/verify";

const input = `
[1] Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). "Attention is all you need." Advances in Neural Information Processing Systems, 30.
[2] Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. NAACL-HLT. https://doi.org/10.18653/v1/N19-1423
[3] Smith, J., & Johnson, K. (2021). "Quantum neural fusion networks for sentiment-aware blockchain analytics." Journal of Advanced Computational Metaphysics, 14(3), 221-240.
[4] Wakefield, A.J., et al. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351(9103), 637-641. doi:10.1016/S0140-6736(97)11096-0
`;

const refs = parseReferences(input);
console.log(`파싱: ${refs.length}건`);
for (const r of refs) {
  console.log(` - doi=${r.doi ?? "-"} year=${r.year ?? "-"} title=${r.title?.slice(0, 50) ?? "-"}`);
}

const results = await verifyAll(refs, (d, t) => console.log(`진행 ${d}/${t}`));
for (const res of results) {
  console.log("\n====", res.ref.raw.slice(0, 70));
  console.log(`판정: ${res.verdict} (신뢰도 ${res.confidence.toFixed(2)}) — ${res.reason}`);
  console.log(`조회 소스: ${res.sourcesChecked.join(" → ")}`);
  if (res.matched) {
    console.log(`매칭: [${res.matched.source}] ${res.matched.title} (${res.matched.year}) doi=${res.matched.doi}`);
  }
  for (const c of res.comparisons) {
    console.log(`  ${c.match ? "OK " : "✗  "} ${c.field}: 입력="${c.inputValue.slice(0, 60)}" ↔ DB="${c.foundValue.slice(0, 60)}"`);
  }
  if (res.retraction.status !== "none") {
    console.log(`  ⚠ 철회/정정: ${res.retraction.status} (${"label" in res.retraction ? res.retraction.label : ""})`);
  }
}

// 기대 결과 검증
const [r1, r2, r3, r4] = results;
const expect = (name: string, cond: boolean) =>
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
console.log("\n--- 기대 결과 ---");
expect("1. Attention (실존, DOI 없음) = exact 또는 minor", r1.verdict === "exact" || r1.verdict === "minor");
expect("2. BERT (실존, DOI 있음) = exact", r2.verdict === "exact");
expect("3. 가짜 논문 = major", r3.verdict === "major");
expect("4. Wakefield 1998 = 철회 감지", r4.retraction.status === "retracted");
