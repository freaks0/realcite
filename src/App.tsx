import { useMemo, useRef, useState } from "react";
import { detectFormat, parseReferences } from "./lib/parse";
import { verifyAll } from "./lib/verify";
import type { VerificationResult, Verdict } from "./lib/types";

const EXAMPLE = `[1] Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). "Attention is all you need." Advances in Neural Information Processing Systems, 30.
[2] Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. NAACL-HLT. https://doi.org/10.18653/v1/N19-1423
[3] Smith, J., & Johnson, K. (2021). "Quantum neural fusion networks for sentiment-aware blockchain analytics." Journal of Advanced Computational Metaphysics, 14(3), 221-240.
[4] Wakefield, A.J., et al. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351(9103), 637-641. doi:10.1016/S0140-6736(97)11096-0`;

const VERDICT_META: Record<Verdict, { icon: string; label: string; cls: string }> = {
  exact: { icon: "✓", label: "실존 확인", cls: "exact" },
  minor: { icon: "!", label: "필드 불일치", cls: "minor" },
  major: { icon: "✕", label: "조작 의심", cls: "major" },
  error: { icon: "?", label: "확인 불가", cls: "error" },
};

const FIELD_LABEL: Record<string, string> = {
  title: "제목",
  authors: "저자",
  year: "연도",
  journal: "저널",
  doi: "DOI",
};

const FORMAT_LABEL = { bibtex: "BibTeX", ris: "RIS", plaintext: "텍스트 목록" };

function ResultCard({ result }: { result: VerificationResult }) {
  const [open, setOpen] = useState(result.verdict !== "exact");
  const [copied, setCopied] = useState(false);
  const meta = VERDICT_META[result.verdict];
  const retracted = result.retraction.status === "retracted";

  const copyBibtex = () => {
    if (!result.correctedBibtex) return;
    navigator.clipboard.writeText(result.correctedBibtex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`card verdict-${meta.cls}${retracted ? " retracted" : ""}`}>
      <button className="card-head" onClick={() => setOpen(!open)}>
        <span className={`badge badge-${meta.cls}`}>
          {meta.icon} {meta.label}
        </span>
        {retracted && <span className="badge badge-retracted">🚫 철회된 논문</span>}
        {result.retraction.status === "concern" && (
          <span className="badge badge-retracted">⚠ 우려 표명</span>
        )}
        <span className="card-raw">{result.ref.raw}</span>
        <span className="chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="card-body">
          <p className="reason">{result.reason}</p>

          {result.matched && (
            <div className="matched">
              <div className="matched-title">
                {result.matched.doi ? (
                  <a href={`https://doi.org/${result.matched.doi}`} target="_blank" rel="noreferrer">
                    {result.matched.title}
                  </a>
                ) : (
                  result.matched.title
                )}
              </div>
              <div className="matched-meta">
                {result.matched.authors.slice(0, 5).join(", ")}
                {result.matched.authors.length > 5 && " 외"}
                {result.matched.year && ` · ${result.matched.year}`}
                {result.matched.journal && ` · ${result.matched.journal}`}
                {result.matched.doi && ` · ${result.matched.doi}`}
              </div>
            </div>
          )}

          {result.comparisons.length > 0 && (
            <table className="compare">
              <thead>
                <tr>
                  <th></th>
                  <th>입력</th>
                  <th>DB 레코드</th>
                </tr>
              </thead>
              <tbody>
                {result.comparisons.map((c) => (
                  <tr key={c.field} className={c.match ? "" : "mismatch"}>
                    <td>
                      {c.match ? "✓" : "✕"} {FIELD_LABEL[c.field]}
                    </td>
                    <td>{c.inputValue}</td>
                    <td>{c.foundValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {retracted && "noticeDoi" in result.retraction && result.retraction.noticeDoi && (
            <p className="retraction-note">
              이 논문은 공식 철회되었습니다 —{" "}
              <a
                href={`https://doi.org/${result.retraction.noticeDoi}`}
                target="_blank"
                rel="noreferrer"
              >
                철회 공지 보기
              </a>
              . 인용하지 않는 것을 권장합니다.
            </p>
          )}

          <div className="card-foot">
            <span className="sources">조회: {result.sourcesChecked.join(" → ")}</span>
            {result.correctedBibtex && (
              <button className="btn-small" onClick={copyBibtex}>
                {copied ? "복사됨 ✓" : "정본 BibTeX 복사"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<VerificationResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const format = useMemo(() => (input.trim() ? detectFormat(input) : null), [input]);
  const running = progress !== null && results === null;

  const run = async () => {
    if (runningRef.current) return;
    const refs = parseReferences(input);
    if (refs.length === 0) {
      setError("참고문헌을 인식하지 못했습니다. 한 줄에 하나씩, 또는 [1] 번호 목록 / BibTeX / RIS 형식으로 붙여넣어 주세요.");
      return;
    }
    runningRef.current = true;
    setError(null);
    setResults(null);
    setProgress({ done: 0, total: refs.length });
    try {
      const out = await verifyAll(refs, (done, total) => setProgress({ done, total }));
      setResults(out);
    } finally {
      runningRef.current = false;
      setProgress(null);
    }
  };

  const copyAllBibtex = () => {
    const all = (results ?? [])
      .map((r) => r.correctedBibtex)
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(all);
  };

  const counts = useMemo(() => {
    if (!results) return null;
    return {
      exact: results.filter((r) => r.verdict === "exact").length,
      minor: results.filter((r) => r.verdict === "minor").length,
      major: results.filter((r) => r.verdict === "major").length,
      error: results.filter((r) => r.verdict === "error").length,
      retracted: results.filter((r) => r.retraction.status === "retracted").length,
    };
  }, [results]);

  return (
    <div className="page">
      <header>
        <div className="wordmark">
          Cite<span>Guard</span>
        </div>
        <p className="tagline">
          AI가 찾아준 논문, 진짜인지 확인하세요 — 참고문헌을 붙여넣으면 Crossref·OpenAlex·Semantic
          Scholar에 실시간 대조해 실존 여부와 철회 여부를 검증합니다.
        </p>
      </header>

      <main>
        <div className="input-panel">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"참고문헌 목록을 붙여넣으세요.\n\n지원 형식: 플레인텍스트([1] 번호 목록, 줄 단위), BibTeX, RIS — 자동 감지됩니다."}
            rows={10}
            spellCheck={false}
            disabled={running}
          />
          <div className="input-bar">
            <div className="input-bar-left">
              {format && <span className="format-chip">{FORMAT_LABEL[format]} 감지됨</span>}
              <button className="btn-ghost" onClick={() => setInput(EXAMPLE)} disabled={running}>
                예시 넣기
              </button>
            </div>
            <button className="btn-primary" onClick={run} disabled={running || !input.trim()}>
              {running ? `검증 중 ${progress!.done}/${progress!.total}` : "검증하기"}
            </button>
          </div>
          {running && (
            <div className="progress">
              <div
                className="progress-fill"
                style={{ width: `${(progress!.done / progress!.total) * 100}%` }}
              />
            </div>
          )}
          {error && <p className="error-msg">{error}</p>}
        </div>

        {counts && results && (
          <>
            <div className="summary">
              <span className="chip chip-exact">✓ 실존 {counts.exact}</span>
              <span className="chip chip-minor">! 필드 불일치 {counts.minor}</span>
              <span className="chip chip-major">✕ 조작 의심 {counts.major}</span>
              {counts.retracted > 0 && (
                <span className="chip chip-retracted">🚫 철회 {counts.retracted}</span>
              )}
              {counts.error > 0 && <span className="chip">? 확인 불가 {counts.error}</span>}
              <span className="spacer" />
              {results.some((r) => r.correctedBibtex) && (
                <button className="btn-small" onClick={copyAllBibtex}>
                  검증된 BibTeX 전체 복사
                </button>
              )}
            </div>
            <div className="results">
              {results.map((r, i) => (
                <ResultCard key={i} result={r} />
              ))}
            </div>
            <p className="disclaimer">
              ⚠ 자동 판정은 참고용입니다. "필드 불일치"와 "조작 의심" 항목은 반드시 원문을 직접
              확인하세요. DOI가 해석된다는 것만으로 인용이 올바르다는 보장은 없습니다.
            </p>
          </>
        )}
      </main>

      <footer>
        <p>
          데이터: Crossref · OpenAlex · Semantic Scholar (철회 정보: Retraction Watch via Crossref)
        </p>
        <p>
          입력하신 참고문헌은 서버로 전송·저장되지 않습니다 — 브라우저에서 학술 DB에 직접
          조회합니다.
        </p>
      </footer>
    </div>
  );
}
