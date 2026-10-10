# CiteGuard — 프로젝트 안내 (Claude용)

연구자·대학원생을 위한 논문 인용 검증 웹앱. AI가 지어낸 가짜 인용(할루시네이션)을 공개 학술 DB 대조로 잡아낸다.

## 현재 상태 (2026-10-08 기준)

- **배포 운영 중**: https://citeguard-bzv.pages.dev (Cloudflare Pages)
- **프록시 Worker**: https://citeguard-proxy.citeguard.workers.dev (`proxy/` 폴더. S2·arXiv·DBLP 중계 + CORS 부여 + 10분 엣지 캐시)
- Cloudflare 계정 freaks17489@gmail.com, wrangler OAuth 로그인 완료, workers.dev 서브도메인 "citeguard"
- 기획·조사 문서: `../citation-verifier-planning/` (01-조사보고서, 02-기획안)

## 명령어

```bash
npm run dev          # 로컬 개발 서버 (localhost:5173)
npm run build        # 정적 빌드 → dist/
npm run deploy       # 빌드 + Cloudflare Pages 배포
npx tsx scripts/smoke.ts                      # 코어 로직 스모크 테스트 (실제 API 호출, 8케이스)
node scripts/browse.mjs <스크린샷폴더> [URL]   # 헤드리스 Edge E2E (playwright-core + msedge 채널)
cd proxy && npx wrangler deploy -c wrangler.toml   # 프록시 재배포
```

## 아키텍처 (운영비 0원 원칙 — 바꾸지 말 것)

서버 없음. 브라우저가 무료 학술 API를 직접 호출하고 정적 호스팅만 사용. 참고문헌은 어떤 서버에도 저장되지 않는다(프라이버시가 신뢰 포인트).

- 코어 로직은 `src/lib/`에 UI 무관 순수 모듈로 분리 (추후 MCP 서버/CLI가 재사용 예정)
- 소스 캐스케이드 (무제한 무료 소스 우선): Crossref → DataCite(arXiv 커버) → Europe PMC → OpenAlex → Semantic Scholar(브라우저에선 프록시 경유)
- OpenAlex: DOI 단건은 무료, 검색은 IP당 일일 한도. 429 시 세션 내 즉시 스킵. 고급 설정에서 BYOK 키 지원(localStorage)
- 판정 5단계: exact / minor(필드 오염) / uncertain(유사 논문 — 제목 불일치 시 minor 금지!) / major(조작 의심) / error(판정 보류)
- **핵심 원칙**: 소스 장애 상태에서 "못 찾음"을 조작 의심으로 단정하지 않는다(보류 처리). 엉뚱한 논문을 같은 논문이라고 내놓는 것이 최악의 오류다.

## 사용자(소유자) 선호 — 반드시 지킬 것

- UI에 이모지 금지, 사용자 노출 문구에 em dash(—) 금지
- 결과 카드는 기본 접힘, 좌측 색 스트라이프 같은 과한 색 장식 금지 (소프트 pill 배지 스타일 유지)
- 디자인: 학술지 조판 아이덴티티 (쿨 페이퍼+잉크, Source Serif 4 워드마크, 스탯 스트립)
- 예시 목록에 특정 실존 연구자(예: Sangkeum Lee)의 논문 넣지 않기 — 유명 논문 + 명시된 가짜([3]번) 조합 유지

## 테스트 규칙

- 판정 로직을 바꾸면 `scripts/smoke.ts`를 반드시 실행 (사용자가 실전에서 발견한 오판정 케이스들이 박제돼 있음 — 새 오판정 제보가 오면 케이스로 추가)
- OpenAlex 한도 소진 시(개발 중 흔함, UTC 자정 리셋) 일부 케이스는 "보류" 경로로 통과하는 게 정상

## 로드맵 (다음 작업 후보)

1. ~~arXiv를 검증 소스로 추가~~ (2026-10-10 완료. DBLP는 Anubis 봇 차단으로 API 접근 불가라 보류 — 우회 금지, 차단 해제 시 재시도. TMLR 등 OpenReview 전용 논문은 여전히 S2 의존 — OpenReview API 검토 후보)
2. Phase 2: KCI 한국어 논문 (KCI OAI-PMH는 무키 — 단, 데이터 라이선스 법무 확인 선행. "KCI 무료 CC" 주장은 조사에서 기각됨)
3. Phase 3: 분야별 동향 브리핑 (LLM 필요 시 BYOK로 운영비 0원 유지)
4. GitHub 저장소 푸시 (아직 로컬 git만 있음)
