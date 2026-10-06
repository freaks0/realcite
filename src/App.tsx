import { useMemo, useRef, useState } from "react";
import { detectFormat, parseReferences } from "./lib/parse";
import { verifyAll } from "./lib/verify";
import { setOpenalexApiKey } from "./lib/sources";
import { formatCitation, STYLE_LABELS, type CitationStyle } from "./lib/citestyles";
import { formatAuthorList } from "./lib/types";
import type { SourceRecord, VerificationResult, Verdict } from "./lib/types";

const EXAMPLE = `[1] Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). "Attention is all you need." Advances in Neural Information Processing Systems, 30.
[2] Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2019). BERT: Pre-training of deep bidirectional transformers for language understanding. NAACL-HLT. https://doi.org/10.18653/v1/N19-1423
[3] Smith, J., & Johnson, K. (2021). "Quantum neural fusion networks for sentiment-aware blockchain analytics." Journal of Advanced Computational Metaphysics, 14(3), 221-240.
[4] Wakefield, A.J., et al. (1998). Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children. The Lancet, 351(9103), 637-641. doi:10.1016/S0140-6736(97)11096-0
[5] Kingma, D. P., & Ba, J. (2015). Adam: A method for stochastic optimization. arXiv. doi:10.48550/arXiv.1412.6980
[6] Jumper, J., Evans, R., Pritzel, A., et al. (2021). Highly accurate protein structure prediction with AlphaFold. Nature, 596(7873), 583-589.`;

const VERDICT_META: Record<Verdict, { icon: string; label: string; cls: string }> = {
  exact: { icon: "✓", label: "실존 확인", cls: "exact" },
  minor: { icon: "!", label: "필드 불일치", cls: "minor" },
  uncertain: { icon: "≈", label: "유사 논문 발견", cls: "uncertain" },
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-small"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "복사됨 ✓" : label}
    </button>
  );
}

function RecordBox({
  rec,
  heading,
  inputJournal,
}: {
  rec: SourceRecord;
  heading?: string;
  inputJournal?: string;
}) {
  return (
    <div className="matched">
      {heading && <div className="matched-heading">{heading}</div>}
      <div className="matched-title">
        {rec.url ? (
          <a href={rec.url} target="_blank" rel="noreferrer">
            {rec.title}
          </a>
        ) : (
          rec.title
        )}
        {rec.isPreprint && <span className="preprint-chip">프리프린트</span>}
      </div>
      <div className="matched-meta">
        {formatAuthorList(rec, 5)}
        {rec.year && ` · ${rec.year}`}
        {rec.journal && ` · ${rec.journal}`}
        {rec.doi && ` · ${rec.doi}`}
      </div>
      {rec.isPreprint && (
        <div className="preprint-note">
          이 논문은 저장소(arXiv 등)에 올라온 프리프린트로만 확인되며, 피어리뷰 저널
          게재본은 찾지 못했습니다.
          {inputJournal && ` 입력에 적힌 저널명(${inputJournal})은 확인되지 않았습니다.`}
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, style }: { result: VerificationResult; style: CitationStyle }) {
  const [open, setOpen] = useState(false);
  const meta = VERDICT_META[result.verdict];
  const retracted = result.retraction.status === "retracted";
  const citation = result.matched ? formatCitation(result.matched, style) : null;

  return (
    <div className={`card verdict-${meta.cls}${retracted ? " retracted" : ""}`}>
      <button className="card-head" onClick={() => setOpen(!open)}>
        <span className={`badge badge-${meta.cls}`}>
          {meta.icon} {meta.label}
        </span>
        {retracted && <span className="badge badge-retracted">철회됨</span>}
        {result.retraction.status === "concern" && (
          <span className="badge badge-retracted">우려 표명</span>
        )}
        <span className="card-raw">{result.ref.raw}</span>
        <span className="chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="card-body">
          <div className="raw-block">
            <div className="raw-text">{result.ref.raw}</div>
            <CopyButton text={result.ref.raw} label="원문 복사" />
          </div>

          <p className="reason">{result.reason}</p>

          {result.matched && (
            <RecordBox
              rec={result.matched}
              heading={result.verdict === "uncertain" ? "이 논문을 의도한 것일 수 있습니다:" : undefined}
              inputJournal={result.ref.journal}
            />
          )}

          {result.nearestMiss && !result.matched && (
            <RecordBox
              rec={result.nearestMiss}
              heading="참고: 검색 중 가장 비슷했던 결과 (동일 논문 아님)"
            />
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
              이 논문은 공식 철회되었습니다.{" "}
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

          {citation && result.verdict !== "uncertain" && (
            <div className="citation-block">
              <div className="citation-head">
                <span className="citation-label">{STYLE_LABELS[style]} 인용</span>
                <CopyButton text={citation} label="복사" />
              </div>
              <pre className="citation-text">{citation}</pre>
            </div>
          )}
          {citation && result.verdict === "uncertain" && (
            <div className="citation-block">
              <div className="citation-head">
                <span className="citation-label">
                  {STYLE_LABELS[style]} 인용 (아래 논문이 맞는 경우에만 사용)
                </span>
                <CopyButton text={citation} label="복사" />
              </div>
              <pre className="citation-text">{citation}</pre>
            </div>
          )}

          <div className="card-foot">
            <span className="sources">조회: {result.sourcesChecked.join(" → ")}</span>
            <span className="foot-links">
              <a
                className="btn-small gs-link"
                href={`https://scholar.google.com/scholar?q=${encodeURIComponent(
                  result.ref.title ?? result.ref.raw.slice(0, 150)
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Google Scholar에서 확인 ↗
              </a>
              <a
                className="btn-small gs-link"
                href={`https://arxiv.org/search/?searchtype=all&query=${encodeURIComponent(
                  result.ref.title ?? result.ref.raw.slice(0, 150)
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                arXiv에서 확인 ↗
              </a>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const OA_KEY_STORAGE = "citeguard.openalexApiKey";

export default function App() {
  const [input, setInput] = useState("");
  const [oaKey, setOaKey] = useState(() => {
    const saved = localStorage.getItem(OA_KEY_STORAGE) ?? "";
    setOpenalexApiKey(saved);
    return saved;
  });

  const updateOaKey = (key: string) => {
    setOaKey(key);
    localStorage.setItem(OA_KEY_STORAGE, key.trim());
    setOpenalexApiKey(key);
  };
  const [results, setResults] = useState<VerificationResult[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<CitationStyle>("bibtex");
  const [copiedAll, setCopiedAll] = useState(false);
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

  const copyAll = () => {
    // 확실한 매칭(exact/minor)만 — uncertain은 사용자가 확인 후 개별 복사
    const all = (results ?? [])
      .filter((r) => r.matched && (r.verdict === "exact" || r.verdict === "minor"))
      .map((r) => formatCitation(r.matched!, style))
      .join(style === "bibtex" ? "\n\n" : "\n");
    navigator.clipboard.writeText(all);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  const counts = useMemo(() => {
    if (!results) return null;
    return {
      exact: results.filter((r) => r.verdict === "exact").length,
      minor: results.filter((r) => r.verdict === "minor").length,
      uncertain: results.filter((r) => r.verdict === "uncertain").length,
      major: results.filter((r) => r.verdict === "major").length,
      error: results.filter((r) => r.verdict === "error").length,
      retracted: results.filter((r) => r.retraction.status === "retracted").length,
    };
  }, [results]);

  return (
    <div className="page">
      <header>
        <div className="eyebrow">Citation Verification</div>
        <div className="wordmark">
          Cite<span>Guard</span>
        </div>
        <p className="tagline">
          AI가 찾아준 논문, 진짜인지 확인하세요. 참고문헌을 붙여넣으면 Crossref, OpenAlex,
          DataCite(arXiv), Europe PMC 등 공개 학술 DB에 실시간 대조해 실존 여부와 철회
          여부를 검증합니다.
        </p>
      </header>

      <main>
        <div className="input-panel">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"참고문헌 목록을 붙여넣으세요.\n\n플레인텍스트([1] 번호 목록, 줄 단위), BibTeX, RIS 형식을 자동 감지합니다."}
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
          <details className="settings">
            <summary>고급 설정</summary>
            <div className="settings-body">
              <label className="settings-label" htmlFor="oa-key">
                OpenAlex API 키 (선택)
              </label>
              <input
                id="oa-key"
                type="text"
                value={oaKey}
                onChange={(e) => updateOaKey(e.target.value)}
                placeholder="키 없이도 동작합니다"
                spellCheck={false}
                autoComplete="off"
              />
              <p className="settings-help">
                키가 없으면 같은 네트워크(IP)끼리 공유하는 무료 한도로 동작합니다. 학교나 회사처럼
                여러 명이 IP를 공유하는 곳에서 "확인 불가"가 자주 뜨면,{" "}
                <a href="https://openalex.org/signup" target="_blank" rel="noreferrer">
                  OpenAlex 무료 계정
                </a>
                을 만들고 설정에서 키를 복사해 넣으세요. 한도가 10배로 늘어납니다. 키는 이
                브라우저에만 저장되며 OpenAlex 외에는 전송되지 않습니다.
              </p>
            </div>
          </details>
          {input === EXAMPLE && (
            <p className="example-note">
              예시 안내: [3]번은 조작 의심 판정을 시연하기 위해 일부러 넣은 가짜 인용입니다
              (실존하지 않는 논문·저널). [4]번은 실존하지만 공식 철회된 논문입니다.
            </p>
          )}
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
              <span className="chip chip-exact">
                <span className="count">{counts.exact}</span>실존 확인
              </span>
              <span className="chip chip-minor">
                <span className="count">{counts.minor}</span>필드 불일치
              </span>
              {counts.uncertain > 0 && (
                <span className="chip chip-uncertain">
                  <span className="count">{counts.uncertain}</span>유사 논문
                </span>
              )}
              <span className="chip chip-major">
                <span className="count">{counts.major}</span>조작 의심
              </span>
              {counts.retracted > 0 && (
                <span className="chip chip-retracted">
                  <span className="count">{counts.retracted}</span>철회됨
                </span>
              )}
              {counts.error > 0 && (
                <span className="chip">
                  <span className="count">{counts.error}</span>확인 불가
                </span>
              )}
            </div>
            <div className="export-bar">
              <label className="export-label">
                인용 형식:
                <select value={style} onChange={(e) => setStyle(e.target.value as CitationStyle)}>
                  {(Object.keys(STYLE_LABELS) as CitationStyle[]).map((s) => (
                    <option key={s} value={s}>
                      {STYLE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              {results.some((r) => r.matched && (r.verdict === "exact" || r.verdict === "minor")) && (
                <button className="btn-small" onClick={copyAll}>
                  {copiedAll ? "복사됨 ✓" : "검증된 참고문헌 전체 복사"}
                </button>
              )}
            </div>
            <div className="results">
              {results.map((r, i) => (
                <ResultCard key={i} result={r} style={style} />
              ))}
            </div>
            <p className="disclaimer">
              자동 판정은 참고용입니다.
              <br />
              "필드 불일치", "유사 논문", "조작 의심" 항목은 반드시 원문을 직접 확인하세요.
              <br />
              DOI가 해석된다는 것만으로 인용이 올바르다는 보장은 없습니다.
            </p>
          </>
        )}
      </main>

      <footer>
        <p>
          입력하신 참고문헌은 서버로 전송되거나 저장되지 않습니다. 브라우저가 공개 학술
          DB(Crossref, DataCite, Europe PMC, OpenAlex, Semantic Scholar)에 직접 조회하며, 철회
          정보는 Retraction Watch 데이터를 사용합니다.
        </p>
      </footer>
    </div>
  );
}
