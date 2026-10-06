import type { ParsedReference } from "./types";
import { extractSurname } from "./similarity";

/** DOI 추출 (끝의 문장부호 제거) */
export function extractDoi(text: string): string | undefined {
  const m = text.match(/10\.\d{4,9}\/[^\s"'<>]+/);
  if (!m) return undefined;
  return m[0].replace(/[.,;:)\]}>]+$/, "");
}

function extractYear(text: string): number | undefined {
  // (2021) 처럼 괄호 안이 가장 신뢰도 높음
  const paren = text.match(/\((19|20)\d{2}[a-z]?\)/);
  if (paren) return parseInt(paren[0].slice(1, 5), 10);
  const all = text.match(/\b(19|20)\d{2}\b/g);
  if (!all) return undefined;
  // 페이지 번호 등과 혼동을 줄이기 위해 첫 번째 연도 사용
  return parseInt(all[0], 10);
}

export type InputFormat = "bibtex" | "ris" | "plaintext";

export function detectFormat(input: string): InputFormat {
  if (/@\s*[a-zA-Z]+\s*\{/.test(input)) return "bibtex";
  if (/^TY\s{2}-\s/m.test(input)) return "ris";
  return "plaintext";
}

/* ---------------- BibTeX ---------------- */

function parseBibtexFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // field = {value} / field = "value" / field = 1234
  const re = /(\w+)\s*=\s*(\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|(\d+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const value = (m[3] ?? m[4] ?? m[5] ?? "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    fields[m[1].toLowerCase()] = value;
  }
  return fields;
}

function parseBibtex(input: string): ParsedReference[] {
  const refs: ParsedReference[] = [];
  const entryRe = /@\s*([a-zA-Z]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(input)) !== null) {
    if (m[1].toLowerCase() === "comment" || m[1].toLowerCase() === "string") continue;
    // 중괄호 짝 맞추기로 엔트리 끝 찾기
    let depth = 1;
    let i = entryRe.lastIndex;
    while (i < input.length && depth > 0) {
      if (input[i] === "{") depth++;
      else if (input[i] === "}") depth--;
      i++;
    }
    const body = input.slice(entryRe.lastIndex, i - 1);
    const raw = input.slice(m.index, i);
    const f = parseBibtexFields(body);
    refs.push({
      raw,
      format: "bibtex",
      doi: f.doi ? extractDoi(f.doi) : extractDoi(raw),
      title: f.title || undefined,
      authors: f.author
        ? f.author.split(/\s+and\s+/i).map(extractSurname).filter(Boolean)
        : undefined,
      year: f.year ? parseInt(f.year, 10) || undefined : undefined,
      journal: f.journal || f.booktitle || undefined,
    });
    entryRe.lastIndex = i;
  }
  return refs;
}

/* ---------------- RIS ---------------- */

function parseRis(input: string): ParsedReference[] {
  const refs: ParsedReference[] = [];
  const entries = input.split(/^ER\s{2}-.*$/m);
  for (const entry of entries) {
    if (!/^TY\s{2}-/m.test(entry)) continue;
    const get = (tag: string): string[] => {
      const re = new RegExp(`^${tag}\\s{2}-\\s*(.+)$`, "gm");
      const out: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(entry)) !== null) out.push(m[1].trim());
      return out;
    };
    const title = get("TI")[0] || get("T1")[0];
    const authors = [...get("AU"), ...get("A1")].map(extractSurname).filter(Boolean);
    const yearStr = get("PY")[0] || get("Y1")[0];
    refs.push({
      raw: entry.trim(),
      format: "ris",
      doi: get("DO")[0] ? extractDoi(get("DO")[0]) : extractDoi(entry),
      title: title || undefined,
      authors: authors.length ? authors : undefined,
      year: yearStr ? parseInt(yearStr.slice(0, 4), 10) || undefined : undefined,
      journal: get("JO")[0] || get("T2")[0] || get("JF")[0] || undefined,
    });
  }
  return refs;
}

/* ---------------- 플레인텍스트 ---------------- */

function splitPlaintext(input: string): string[] {
  const text = input.trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);

  // [1] 또는 "1." 번호 매김이 있으면 번호 기준으로 묶음 (여러 줄 항목 지원)
  const numbered = /^\s*(\[\d+\]|\d+[.)])\s+/;
  if (lines.filter((l) => numbered.test(l)).length >= 2) {
    const items: string[] = [];
    let cur = "";
    for (const line of lines) {
      if (numbered.test(line)) {
        if (cur.trim()) items.push(cur.trim());
        cur = line.replace(numbered, "");
      } else {
        cur += " " + line.trim();
      }
    }
    if (cur.trim()) items.push(cur.trim());
    return items;
  }

  // 빈 줄로 구분된 블록이 있으면 블록 단위
  const blocks = text.split(/\n\s*\n/).map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (blocks.length >= 2) return blocks;

  // 아니면 한 줄 = 한 항목
  return lines.map((l) => l.trim()).filter((l) => l.length > 10);
}

/** 플레인텍스트 인용에서 제목 추정 */
function guessTitle(raw: string): string | undefined {
  // 1) 따옴표로 감싼 제목: "Title here," 또는 “Title here”
  const quoted = raw.match(/["“]([^"”]{10,})["”]/);
  if (quoted) return quoted[1].replace(/[,.]$/, "").trim();
  // 2) APA 스타일: "저자들 (2017). 제목. 저널..." — 연도 괄호 뒤 첫 마침표까지
  const afterYear = raw.match(/\((?:19|20)\d{2}[a-z]?\)[.:]?\s+([^.]{15,250})\./);
  if (afterYear) return afterYear[1].trim();
  // 3) 폴백: 마침표로 나눈 구간 중 가장 긴 것 (저자 목록은 이니셜 "A." 때문에 짧게 쪼개짐)
  const segments = raw
    .split(/(?<=[a-z가-힣)])\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && !/^https?:/.test(s) && !/^doi/i.test(s));
  if (segments.length > 0) {
    const longest = segments.reduce((a, b) => (b.length > a.length ? b : a));
    if (longest.length >= 20) return longest.replace(/[,.]$/, "");
  }
  return undefined;
}

function parsePlaintextItem(raw: string): ParsedReference {
  return {
    raw,
    format: "plaintext",
    doi: extractDoi(raw),
    title: guessTitle(raw),
    year: extractYear(raw),
  };
}

/* ---------------- 공개 API ---------------- */

export function parseReferences(input: string): ParsedReference[] {
  const format = detectFormat(input);
  if (format === "bibtex") return parseBibtex(input);
  if (format === "ris") return parseRis(input);
  return splitPlaintext(input).map(parsePlaintextItem);
}
