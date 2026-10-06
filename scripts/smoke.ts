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
[6] Neha Sengar, Andres Saurez, Dongsoo Har, Sangkeum Lee, "Few Contrastive Attention Heads Enable Visual Grounding in Large Vision-Language Models," Transactions on Machine Learning Research, 2026.
[7] Hojun Jin, Sangkeum Lee, Sarvar Hussain Nengroo, Dongsoo Har, "Peer-to-peer energy trading between nanogrids with utilization of energy storage system considering battery degradation cost," Energy and Buildings, 2023.
[8] Sangkeum Lee, Li Ping Yan, Maryam Sanatifar, Lingyi Feng, Seyedalireza Jazayerifar, Atieh Nouralishahi, "The Applications of Intelligent Optimization Algorithms in Sentiment Analysis: A Deep and Systematic Study," Arabian Journal of Business and Management Review, 2023.
`;

const refs = parseReferences(input);
console.log(`파싱: ${refs.length}건`);

const results = await verifyAll(refs, (d, t) => console.log(`진행 ${d}/${t}`));
for (const res of results) {
  console.log("\n====", res.ref.raw.slice(0, 70));
  console.log(`판정: ${res.verdict} (신뢰도 ${res.confidence.toFixed(2)}) — ${res.reason.slice(0, 120)}`);
  console.log(`조회 소스: ${res.sourcesChecked.join(" → ")}`);
  const rec = res.matched ?? res.nearestMiss;
  if (rec) {
    const kind = res.matched ? "매칭" : "최근접(기각)";
    console.log(
      `${kind}: [${rec.source}] ${rec.title.slice(0, 80)} (${rec.year}) doi=${rec.doi ?? "-"} preprint=${rec.isPreprint ?? false}`
    );
  }
  for (const c of res.comparisons) {
    console.log(`  ${c.match ? "OK " : "✗  "} ${c.field}: 입력="${c.inputValue.slice(0, 45)}" ↔ DB="${c.foundValue.slice(0, 45)}"`);
  }
  if (res.retraction.status !== "none") console.log(`  ⚠ 철회/정정: ${res.retraction.status}`);
}

// 인용 형식 변환 샘플 (2번 BERT 레코드)
const bert = results[1]?.matched;
if (bert) {
  console.log("\n--- 인용 형식 변환 (BERT, APA) ---");
  console.log(formatCitation(bert, "apa"));
}

// 기대 결과 검증
const [r1, r2, r3, r4, r5, r6, r7, r8] = results;
let failed = 0;
const expect = (name: string, cond: boolean) => {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
};
console.log("\n--- 기대 결과 ---");
// OpenAlex 검색은 IP당 일일 무료 한도가 있어 소진 시 '판정 보류(error)'가 정답 동작.
// 보류는 허용하되, 엉뚱한 논문을 exact/minor로 내놓는 것만은 어떤 상황에도 금지.
const held = (r: typeof r1) => r.verdict === "error" && /한도|보류/.test(r.reason);
expect("1. Attention (실존) = exact/minor", r1.verdict === "exact" || r1.verdict === "minor");
expect("2. BERT (DOI) = exact", r2.verdict === "exact");
expect("3. 가짜 논문 = major (또는 소스 한도 시 보류)", r3.verdict === "major" || held(r3));
expect("4. Wakefield = 철회 감지", r4.retraction.status === "retracted");
expect("5. 제목 변형(양자) = uncertain + 실제 arXiv 논문 (또는 한도 시 보류)",
  (r5.verdict === "uncertain" && /ancilla/i.test(r5.matched?.title ?? "")) || held(r5));
// TMLR은 S2에만 색인 — S2 공유 풀이 응답하면 exact, 429로 막히면 major+최근접 (minor 오매칭만 금지)
expect("6. TMLR 논문 = S2 응답 시 exact/minor, 아니면 major/보류 (엉뚱한 논문 minor 금지)",
  ((r6.verdict === "exact" || r6.verdict === "minor") && /contrastive attention/i.test(r6.matched?.title ?? "")) ||
    (r6.verdict === "major" && !!r6.nearestMiss) || held(r6));
expect("7. P2P 나노그리드 = 같은 저자의 실제 논문 제시 (또는 한도 시 보류), 엉뚱한 SSRN minor 금지",
  ((r7.verdict === "uncertain" || r7.verdict === "exact" || r7.verdict === "minor") &&
    /nanogrid/i.test(r7.matched?.title ?? "")) || held(r7));
expect("8. ResearchGate 전용 논문 = major/uncertain/보류 (minor 금지)",
  r8.verdict === "major" || r8.verdict === "uncertain" || held(r8));
process.exit(failed > 0 ? 1 : 0);
