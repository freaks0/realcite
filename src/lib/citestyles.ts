import type { RecordAuthor, SourceRecord } from "./types";
import { toBibtex } from "./bibtex";

export type CitationStyle = "bibtex" | "apa" | "ieee" | "mla" | "chicago" | "vancouver";

export const STYLE_LABELS: Record<CitationStyle, string> = {
  bibtex: "BibTeX (Overleaf)",
  apa: "APA 7",
  ieee: "IEEE",
  mla: "MLA 9",
  chicago: "Chicago",
  vancouver: "Vancouver",
};

/** "Minh Wonho" → "M. W." (이미 이니셜이면 그대로) */
function initials(given?: string): string {
  if (!given) return "";
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(" ");
}

function fullName(a: RecordAuthor): string {
  return a.given ? `${a.given} ${a.family}` : a.family;
}

function doiOrUrl(rec: SourceRecord): string {
  if (rec.doi) return `https://doi.org/${rec.doi}`;
  return rec.url ?? "";
}

/* ---- 스타일별 저자 목록 ---- */

function apaAuthors(authors: RecordAuthor[]): string {
  const names = authors.map((a) => {
    const ini = initials(a.given);
    return ini ? `${a.family}, ${ini}` : a.family;
  });
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length > 20) return `${names.slice(0, 19).join(", ")}, ... ${names[names.length - 1]}`;
  return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
}

function ieeeAuthors(authors: RecordAuthor[]): string {
  const names = authors.map((a) => {
    const ini = initials(a.given);
    return ini ? `${ini} ${a.family}` : a.family;
  });
  if (names.length === 0) return "";
  if (names.length > 6) return `${names[0]} et al.`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function mlaAuthors(authors: RecordAuthor[]): string {
  if (authors.length === 0) return "";
  const first = authors[0];
  const firstStr = first.given ? `${first.family}, ${first.given}` : first.family;
  if (authors.length === 1) return firstStr;
  if (authors.length === 2) return `${firstStr}, and ${fullName(authors[1])}`;
  // 마침표는 호출부가 붙인다 (et al.. 방지)
  return `${firstStr}, et al`;
}

function vancouverAuthors(authors: RecordAuthor[]): string {
  const names = authors.map((a) => {
    const ini = initials(a.given).replace(/[.\s]/g, "");
    return ini ? `${a.family} ${ini}` : a.family;
  });
  if (names.length === 0) return "";
  if (names.length > 6) return `${names.slice(0, 6).join(", ")}, et al`;
  return names.join(", ");
}

/* ---- 포맷터 ---- */

export function formatCitation(rec: SourceRecord, style: CitationStyle): string {
  if (style === "bibtex") return toBibtex(rec);

  const year = rec.year ? String(rec.year) : "n.d.";
  const journal = rec.journal ?? (rec.isPreprint ? "arXiv preprint" : "");
  const link = doiOrUrl(rec);

  switch (style) {
    case "apa": {
      const parts = [
        `${apaAuthors(rec.authors)} (${year}).`,
        `${rec.title}.`,
        journal ? `${journal}.` : "",
        link,
      ];
      return parts.filter(Boolean).join(" ").trim();
    }
    case "ieee": {
      const parts = [
        `${ieeeAuthors(rec.authors)},`,
        `"${rec.title},"`,
        journal ? `${journal},` : "",
        `${year}.`,
        rec.doi ? `doi: ${rec.doi}.` : link,
      ];
      return parts.filter(Boolean).join(" ").trim();
    }
    case "mla": {
      const parts = [
        `${mlaAuthors(rec.authors)}.`,
        `"${rec.title}."`,
        journal ? `${journal},` : "",
        `${year}.`,
        link ? `${link}.` : "",
      ];
      return parts.filter(Boolean).join(" ").trim();
    }
    case "chicago": {
      // 첫 저자만 "성, 이름", 나머지는 "이름 성", 마지막 저자 앞에 and
      const first = rec.authors[0];
      const firstStr = first ? (first.given ? `${first.family}, ${first.given}` : first.family) : "";
      const rest = rec.authors.slice(1).map(fullName);
      const chicagoNames =
        rest.length === 0
          ? firstStr
          : rest.length === 1
            ? `${firstStr}, and ${rest[0]}`
            : `${firstStr}, ${rest.slice(0, -1).join(", ")}, and ${rest[rest.length - 1]}`;
      const parts = [
        `${chicagoNames}.`,
        `${year}.`,
        `"${rec.title}."`,
        journal ? `${journal}.` : "",
        link ? `${link}.` : "",
      ];
      return parts.filter(Boolean).join(" ").trim();
    }
    case "vancouver": {
      const parts = [
        `${vancouverAuthors(rec.authors)}.`,
        `${rec.title}.`,
        journal ? `${journal}.` : "",
        `${year}.`,
        rec.doi ? `doi:${rec.doi}` : link,
      ];
      return parts.filter(Boolean).join(" ").trim();
    }
  }
}
