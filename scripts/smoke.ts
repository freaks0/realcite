/** 코어 검증 로직 스모크 테스트 — 실제 학술 API 호출 (node 22+, npx tsx scripts/smoke.ts) */
import { parseReferences } from "../src/lib/parse";
import { verifyAll } from "../src/lib/verify";
import { formatCitation } from "../src/lib/citestyles";

const input = `
[1] Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). "Attention is all you need." Advances in Neural Information Processing Systems, 30.
[2] Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. NAACL-HLT. https://doi.org/10.18653/v1/N19-1423
[3] Smith, J., & Johnson, K. (2021). "Quantum neural fusion networks for sentiment-aware blockchain analytics." Journal of Advanced Computational Metaphysics, 14(3), 221-240.
[4] Wakefield, A.J., et al. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351(9103), 637-641. doi:10.1016/S0140-6736(97)11096-0
[5] Sangkeum Lee, "Blind reset recycles ancilla qubits for variational quantum workloads," Discover Quantum Science, 2026.
`;

const refs = parseReferences(input);
console.log(`파싱: ${refs.length}건`);
for (const r of refs) {
  console.log(
    ` - doi=${r.doi ?? "-"} year=${r.year ?? "-"} authors=${r.authors?.join("/") ?? "-"} title=${r.title?.slice(0, 45) ?? "-"}`
  );
}

const results = await verifyAll(refs, (d, t) => console.log(`진행 ${d}/${t}`));
for (const res of results) {
  console.log("\n====", res.ref.raw.slice(0, 70));
  console.log(`판정: ${res.verdict} (신뢰도 ${res.confidence.toFixed(2)}) — ${res.reason}`);
  console.log(`조회 소스: ${res.sourcesChecked.join(" → ")}`);
  const rec = res.matched ?? res.nearestMiss;
  if (rec) {
    const kind = res.matched ? "매칭" : "최근접(기각)";
    console.log(
      `${kind}: [${rec.source}] ${rec.title} (${rec.year}) doi=${rec.doi ?? "-"} preprint=${rec.isPreprint ?? false}`
    );
  }
  for (const c of res.comparisons) {
    console.log(`  ${c.match ? "OK " : "✗  "} ${c.field}: 입력="${c.inputValue.slice(0, 50)}" ↔ DB="${c.foundValue.slice(0, 50)}"`);
  }
  if (res.retraction.status !== "none") {
    console.log(`  ⚠ 철회/정정: ${res.retraction.status}`);
  }
}

// 인용 형식 변환 샘플 (2번 BERT 레코드)
const bert = results[1]?.matched;
if (bert) {
  console.log("\n--- 인용 형식 변환 (BERT) ---");
  for (const s of ["apa", "ieee", "vancouver", "bibtex"] as const) {
    console.log(`[${s}] ${formatCitation(bert, s).split("\n")[0]}`);
  }
}

// 기대 결과 검증
const [r1, r2, r3, r4, r5] = results;
let failed = 0;
const expect = (name: string, cond: boolean) => {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
};
console.log("\n--- 기대 결과 ---");
expect("1. Attention (실존, DOI 없음) = exact 또는 minor", r1.verdict === "exact" || r1.verdict === "minor");
expect("1. 저자 파싱됨 (원문에서 추정 아님)", (r1.ref.authors?.length ?? 0) > 0);
expect("2. BERT (실존, DOI 있음) = exact", r2.verdict === "exact");
expect("3. 가짜 논문 = major (엉뚱한 논문을 minor로 내놓지 않음)", r3.verdict === "major");
expect("4. Wakefield 1998 = 철회 감지", r4.retraction.status === "retracted");
expect(
  "5. 제목 변형 인용 = uncertain(유사 논문) 또는 major (minor 금지)",
  r5.verdict === "uncertain" || r5.verdict === "major"
);
expect("5. 저자 Sangkeum Lee 파싱됨", r5.ref.firstAuthorFull?.toLowerCase().includes("lee") === true);
if (r5.verdict === "uncertain") {
  expect(
    "5. 유사 논문이 실제 논문(Measurement-Free Ancilla Recycling...)인지",
    /ancilla/i.test(r5.matched?.title ?? "")
  );
}
process.exit(failed > 0 ? 1 : 0);
