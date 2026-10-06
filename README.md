# CiteGuard — 논문 인용 검증 도구

AI가 찾아준 논문 인용이 **진짜인지** 확인하는 웹 앱. 참고문헌 목록을 붙여넣으면 Crossref · DataCite(arXiv) · Europe PMC · OpenAlex · Semantic Scholar에 실시간 대조해 실존 여부·메타데이터 정확성·철회(retraction) 여부를 검증합니다.

> 배경: LLM이 생성한 인용의 11~57%가 조작이라는 감사 결과가 있고(arXiv 2603.03299), 조작 인용은 이미 출판 문헌에 침투 중입니다. 기획·조사 문서는 `../citation-verifier-planning/` 참고.

## 특징

- **운영비 0원 아키텍처**: 서버 없음. 브라우저가 무료 학술 API(CORS 지원)를 직접 호출 → 정적 호스팅만으로 배포. 참고문헌이 외부 서버에 저장되지 않음.
- **3단계 판정**: ✅ 실존 확인(Exact) / ⚠️ 필드 불일치(Minor — 올바른 값 제시) / ❌ 조작 의심(Major). 이분법 판정 금지 — 모든 판정에 근거(매칭 DOI, 필드 비교표, 조회 소스) 첨부.
- **DOI 해석 ≠ 진짜**: DOI가 해석되어도 제목·저자·연도를 교차 대조 (가짜 인용이 실제 DOI를 도용하는 패턴 대응).
- **철회 감지**: Retraction Watch 데이터(Crossref 통합) + PubMed/OpenAlex 플래그.
- **입력 형식 자동 감지**: 플레인텍스트 목록([1] 번호/줄 단위), BibTeX, RIS.
- **정본 BibTeX 내보내기**: 검증된 메타데이터로 교정된 BibTeX 생성.

## 검증 파이프라인

```
입력 → 파싱 (BibTeX/RIS/플레인텍스트, DOI·제목·연도 추출)
  → [DOI 있음] Crossref 해석 → DataCite(arXiv 등 저장소 DOI) → OpenAlex
      → 제목 일치 확인 (DOI 도용 탐지)
  → [DOI 없음/실패] Crossref 서지 검색 (query.bibliographic)
      → 확신 미달 시 DataCite → Europe PMC → OpenAlex 제목 검색 → Semantic Scholar
      → 그래도 없으면 OpenAlex 저자+연도(±2) 검색으로 유사 논문 제시
      → 후보 스코어링: 제목 유사도 + 연도·저자 일치 보너스/페널티
  → 철회 확인 (Crossref filter=updates: + OpenAlex is_retracted)
  → 판정 + 근거 + 교정 BibTeX
```

## 개발

```bash
npm install
npm run dev          # 개발 서버 (localhost:5173)
npm run build        # 정적 빌드 → dist/
npx tsx scripts/smoke.ts    # 코어 로직 스모크 테스트 (실제 API 호출)
node scripts/browse.mjs .   # 헤드리스 브라우저 E2E (Edge 필요)
```

`src/lib/`는 UI와 무관한 순수 모듈 — 추후 MCP 서버/CLI가 그대로 재사용.

## 배포

정적 호스팅이면 어디든: `npm run build` 후 `dist/`를 GitHub Pages / Cloudflare Pages / Vercel에 업로드.

`src/lib/sources.ts`의 `MAILTO` 상수는 Crossref/OpenAlex polite pool 식별용 — 배포 시 운영자 이메일로 유지할 것.

## 알려진 한계 (MVP)

- OpenAlex는 IP당 무료 일일 크레딧제 — 같은 IP를 공유하는 환경(대학 캠퍼스 등)에서 한도가 소진될 수 있음. 소스 장애는 판정별로 격리되어 나머지 소스만으로 계속 진행하며, 소스 부족 상태에서 "못 찾음"은 조작 의심이 아닌 **판정 보류(확인 불가)**로 표시됨.

- Semantic Scholar는 무키 공유 풀이라 간헐적으로 429를 반환하며, 429 응답에 CORS 헤더가 없어 브라우저 콘솔에 CORS 오류로 표시됨 (정상 응답 시엔 브라우저에서도 동작). 안정화는 Cloudflare Workers 무료 프록시(배포 단계)로 예정.
- 상류 DB 메타데이터 오류는 그대로 반영됨 (예: NeurIPS 2017 논문이 2025년 재등록 DOI로 기록된 사례) — 이런 경우 ⚠️로 표시되어 수동 확인 유도.
- 한국어 문헌(KCI)은 Phase 2 (프록시 + 라이선스 확인 필요).
- 자동 판정은 참고용. ⚠️/❌ 항목은 반드시 원문 확인.
