import type { SourceRecord } from "./types";

const TYPE_MAP: Record<string, string> = {
  "journal-article": "article",
  "proceedings-article": "inproceedings",
  "book-chapter": "incollection",
  book: "book",
  monograph: "book",
  "posted-content": "misc",
  preprint: "misc",
  report: "techreport",
  dataset: "misc",
};

function citeKey(rec: SourceRecord): string {
  const author = (rec.authors[0]?.family ?? "unknown").toLowerCase().replace(/[^a-z가-힣]/g, "");
  const word =
    rec.title
      .toLowerCase()
      .split(/\s+/)
      .find((w) => w.length > 3)
      ?.replace(/[^a-z0-9가-힣]/g, "") ?? "work";
  return `${author}${rec.year ?? ""}${word}`;
}

/** 검증된 레코드로부터 정본 BibTeX 생성 */
export function toBibtex(rec: SourceRecord): string {
  const type = TYPE_MAP[rec.type ?? ""] ?? "article";
  const lines: string[] = [];
  if (rec.title) lines.push(`  title = {${rec.title}}`);
  if (rec.authors.length) {
    const names = rec.authors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family));
    lines.push(`  author = {${names.join(" and ")}}`);
  }
  if (rec.journal) {
    lines.push(`  ${type === "inproceedings" ? "booktitle" : "journal"} = {${rec.journal}}`);
  }
  if (rec.year) lines.push(`  year = {${rec.year}}`);
  if (rec.doi) lines.push(`  doi = {${rec.doi}}`);
  if (rec.url) lines.push(`  url = {${rec.url}}`);
  if (rec.isPreprint) lines.push(`  note = {Preprint}`);
  return `@${type}{${citeKey(rec)},\n${lines.join(",\n")}\n}`;
}
