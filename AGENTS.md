# RealCite

연구자와 대학원생을 위한 논문 인용 검증 웹앱. AI가 지어낸 가짜 인용을 공개 학술 DB 대조로 잡아낸다.

## 명령어

```bash
npm run dev                                   # 로컬 개발 서버 (localhost:5173)
npm test                                      # 단위 테스트 (vitest, API 모킹, 네트워크 없음). Node 22 이상 필요
npm run build                                 # 정적 빌드, dist/
npm run deploy                                # 빌드 + Cloudflare Pages 배포
npx tsx scripts/smoke.ts                      # 코어 로직 스모크 테스트 (실제 API 호출, 8케이스)
node scripts/browse.mjs <스크린샷폴더> [URL]   # 헤드리스 Edge E2E (playwright-core, msedge 채널)
node scripts/readme-shot.mjs docs              # README 스크린샷 4장 갱신 (운영 사이트, 라이트와 다크)
cd proxy && npx wrangler deploy -c wrangler.toml   # 프록시 Worker 재배포
```

## 아키텍처 원칙 (바꾸지 말 것)

- 서버 없음, 운영비 0원. 브라우저가 무료 학술 API를 직접 호출하고 정적 호스팅만 쓴다. 참고문헌은 어떤 서버에도 저장하지 않는다. 프라이버시가 신뢰 포인트다.
- 코어 로직은 `src/lib/`에 UI와 무관한 순수 모듈로 둔다. 추후 MCP 서버와 CLI가 재사용한다.
- 소스 캐스케이드는 무제한 무료 소스 우선: Crossref, DataCite(arXiv 커버), Europe PMC, OpenAlex, Semantic Scholar 순. Semantic Scholar는 브라우저에서 `proxy/` 경유.
- OpenAlex는 DOI 단건 무료, 검색은 IP당 일일 한도. 429가 오면 세션 내 즉시 스킵. 고급 설정의 BYOK 키는 localStorage에 둔다.
- `src/lib/sources.ts`의 `MAILTO` 상수는 Crossref와 OpenAlex polite pool 식별용이다. 배포 시 운영자 이메일로 유지한다.

## 판정 규칙

- 5단계: exact, minor(필드 오염), uncertain(유사 논문), major(조작 의심), error(판정 보류).
- 제목이 불일치하면 minor로 내리지 않는다. uncertain이다.
- 소스 장애로 못 찾은 것을 major로 단정하지 않는다. error로 보류한다.
- 가장 나쁜 오류는 엉뚱한 논문을 같은 논문이라고 내놓는 것이다.

## UI 규칙

- 이모지와 em dash를 쓰지 않는다.
- 결과 카드는 기본 접힘. 좌측 색 스트라이프 같은 과한 장식 금지, 소프트 pill 배지 스타일 유지.
- 학술지 조판 아이덴티티: 쿨 페이퍼와 잉크, Source Serif 4 워드마크, 스탯 스트립.
- 예시 목록에 실존 연구자의 논문을 넣지 않는다. 유명 논문과 명시된 가짜([3]번) 조합을 유지한다.

## 테스트

- 파싱, 판정, 서식 로직을 바꾸면 `npm test`(`src/lib/__tests__/`)를 통과시킨다. 판정 규칙이 바뀌면 테스트도 같이 고친다.
- 판정 로직을 바꾸면 `scripts/smoke.ts`를 반드시 실행한다. 실전에서 발견한 오판정 사례가 박제돼 있다. 새 오판정 제보는 케이스로 추가한다.
- OpenAlex 한도 소진 시(UTC 자정 리셋) 일부 케이스가 보류 경로로 통과하는 것은 정상이다.
