/** 제목·문자열 퍼지 매칭 유틸 */

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "for", "and", "or", "to", "with", "by",
  "is", "are", "at", "from", "its", "their", "using", "via",
]);

/** 비교용 정규화: 소문자, 발음기호 제거, 영숫자·한글만 남김 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/**
 * 제목 유사도 (0~1): 토큰 집합 Dice 계수.
 * 짧은 제목에서도 안정적이도록 토큰 기반을 사용.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/**
 * 포함 유사도 (0~1): needle(후보 제목)의 토큰이 haystack(입력 원문)에
 * 얼마나 포함되는가. 플레인텍스트 인용처럼 제목을 따로 못 뽑은 경우에 사용.
 */
export function containment(needle: string, haystack: string): number {
  const tn = tokens(needle);
  if (tn.length === 0) return 0;
  const th = new Set(tokens(haystack));
  let found = 0;
  for (const t of tn) if (th.has(t)) found++;
  return found / tn.length;
}

/** 저자 성(surname)이 문자열에 등장하는지 */
export function surnameInText(surname: string, text: string): boolean {
  const s = normalize(surname);
  if (!s) return false;
  return new Set(tokens(text)).has(s);
}

/** "Kim, J." / "Jane Kim" / "J. Kim" 등에서 성 추출 (휴리스틱) */
export function extractSurname(author: string): string {
  const cleaned = author.replace(/[{}]/g, "").trim();
  if (cleaned.includes(",")) return cleaned.split(",")[0].trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  // 마지막 토큰이 이니셜("J.")이면 첫 토큰이 성일 가능성이 높음
  const last = parts[parts.length - 1];
  if (/^[A-Z]\.?$/.test(last) && parts.length > 1) return parts[0];
  return last;
}
