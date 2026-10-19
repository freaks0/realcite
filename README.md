# RealCite

AI가 찾아준 논문 인용이 실제로 존재하는지 확인하는 웹 앱입니다. 참고문헌 목록을 붙여넣으면 Crossref, DataCite, Europe PMC, arXiv, OpenAlex, Semantic Scholar에 대조해 실존 여부, 메타데이터 정확성, 철회 여부를 확인합니다.

운영 주소: https://realcite.pages.dev

## 왜 만들었나

연구실에서 연구를 하다 보면 AI에게 논문을 찾아 달라고 하는 일이 잦다. 새 주제를 잡을 때 그 분야의 최신 논문과 방법론을 훑을 때, 관련 연구 절을 쓰면서 참조할 논문을 모을 때, 초고를 다 쓴 뒤 본문의 주장에 맞는 인용을 뒤늦게 찾을 때. 세 경우 모두 AI는 그럴듯한 제목과 저자와 연도를 내놓지만, 그중 일부는 존재하지 않는 논문이거나 실제 논문 여러 편의 제목과 저자가 뒤섞인 것이었다. LLM이 생성한 인용의 11~57%가 조작이라는 감사 결과(arXiv 2603.03299)도 있다.

이걸 피하려고 연구마다 arXiv, Hugging Face Papers, 분야 저널과 학회 사이트, Google Scholar를 검색하는 스킬이나 MCP를 붙이고, "실제 존재하는 논문만 DOI와 함께"라고 프롬프트를 길게 써야 했다. 그래도 결과를 하나씩 열어 보며 확인하는 일은 그대로 남았다. 틀린 인용이 하나 나오면 그 목록 전체를 다시 의심해야 해서, AI를 쓴 것이 오히려 시간을 더 잡아먹는 경우도 있었다. 같은 연구실 학우들도 같은 과정을 각자 반복하고 있었다.

그래서 AI가 내놓은 참고문헌 목록을 통째로 붙여넣으면 공개 학술 DB에 대조해 주는 도구를 만들었다. 설치 없이 링크 하나로 쓸 수 있도록 웹으로 만들었고, 검증이 끝나면 교정된 참고문헌을 바로 복사해 원고에 넣을 수 있게 했다.

## 설계에서 신경 쓴 것

1. 검증기도 틀릴 수 있다. 한 소스에서 못 찾았다고 조작으로 단정하지 않는다. Crossref에서 시작해 DataCite, Europe PMC, arXiv, OpenAlex, Semantic Scholar 순으로 넘어가며 다시 찾고, 그래도 없으면 저자와 연도로 비슷한 논문을 찾아 제시한다. 소스가 장애 상태라서 못 찾은 것은 "확인 불가"로 따로 표시한다. 조작 의심과 확인 불가를 섞어 버리면 사용자가 결국 전부 다시 확인해야 해서 도구를 쓴 의미가 없어진다.
2. DOI가 열린다고 진짜는 아니다. 가짜 인용이 실제 논문의 DOI를 가져다 붙이는 경우가 있어서, DOI가 해석돼도 제목, 저자, 연도를 교차 대조한다.
3. 판정에는 근거를 붙인다. 실존 확인, 필드 불일치(올바른 값 제시), 유사 논문 발견, 조작 의심, 확인 불가의 다섯 단계로 나누고, 매칭된 DOI, 필드 비교표, 조회한 소스를 함께 보여준다. 맞다 틀리다 둘로만 답하지 않는다.
4. 철회된 논문을 잡는다. 실존하더라도 철회된 논문이면 인용하면 안 되므로, Retraction Watch 데이터(Crossref 통합)와 OpenAlex 플래그로 철회 여부를 표시한다.
5. 검증 결과를 바로 쓸 수 있게 한다. 검증된 메타데이터로 교정한 참고문헌을 BibTeX(Overleaf용), RIS, APA 7, MLA 9, Chicago, IEEE, Vancouver 형식으로 복사할 수 있다. 목록 전체를 한 번에 복사하거나, 논문별로 원문과 교정본과 조회 근거를 따로 볼 수 있다.
6. 참고문헌은 어디에도 저장되지 않는다. 서버 없이 브라우저가 무료 학술 API를 직접 호출하고 정적 호스팅만 쓴다. 미발표 원고의 참고문헌 목록이 외부 서버에 남지 않고, 운영비도 0원이다.
7. 코어 로직은 UI와 분리했다. `src/lib/`의 파싱, 조회, 판정, 서식 모듈은 브라우저에 의존하지 않아서, 나중에 MCP 서버나 CLI로 붙이면 AI가 논문을 찾는 시점에 바로 검증할 수 있다.

## 사용법

1. 참고문헌 목록을 붙여넣는다. 플레인텍스트([1] 번호 목록 또는 줄 단위), BibTeX, RIS 형식을 자동으로 감지한다.
2. 검증 결과를 확인한다. 항목마다 판정과 근거가 붙고, 필드 불일치는 올바른 값을 같이 보여준다.
3. 필요한 형식으로 복사한다. 전체 복사 또는 논문별 복사.

## 검증 파이프라인

```
입력 → 파싱 (BibTeX/RIS/플레인텍스트, DOI·제목·연도 추출)
  → [DOI 있음] Crossref 해석 → DataCite(arXiv 등 저장소 DOI) → OpenAlex
      → 제목 일치 확인 (DOI 도용 탐지)
  → [DOI 없음/실패] Crossref 서지 검색 (query.bibliographic)
      → 확신 미달 시 DataCite → Europe PMC → arXiv → OpenAlex 제목 검색 → Semantic Scholar
      → 그래도 없으면 OpenAlex 저자+연도(±2) 검색으로 유사 논문 제시
      → 후보 스코어링: 제목 유사도 + 연도·저자 일치 보너스/페널티
  → 철회 확인 (Crossref filter=updates: + OpenAlex is_retracted)
  → 판정 + 근거 + 교정 참고문헌
```

## 개발

```bash
npm install
npm run dev          # 개발 서버 (localhost:5173)
npm run build        # 정적 빌드 → dist/
npx tsx scripts/smoke.ts    # 코어 로직 스모크 테스트 (실제 API 호출)
node scripts/browse.mjs .   # 헤드리스 브라우저 E2E (Edge 필요)
```

## 배포

- 운영 URL: https://realcite.pages.dev (Cloudflare Pages, 프로젝트명 realcite)
- 프록시 Worker: https://realcite-proxy.citeguard.workers.dev (`proxy/` 폴더. Semantic Scholar와 arXiv 중계, CORS 부여, 10분 캐시. DBLP는 2026년 10월 현재 봇 차단으로 업스트림이 응답하지 않아 소스에서 제외)
- 앱 재배포: `npm run deploy` (빌드 후 Pages 업로드)
- 프록시 재배포: `cd proxy && npx wrangler deploy -c wrangler.toml`

`src/lib/sources.ts`의 `MAILTO` 상수는 Crossref와 OpenAlex의 polite pool 식별용이다. 배포 시 운영자 이메일로 유지한다.

## 알려진 한계

- OpenAlex는 IP당 무료 일일 크레딧제라서, 같은 IP를 공유하는 환경(대학 캠퍼스 등)에서 한도가 소진될 수 있다. 소스 장애는 판정별로 격리되어 나머지 소스만으로 계속 진행하며, 소스가 부족한 상태에서 "못 찾음"은 조작 의심이 아니라 확인 불가로 표시된다.
- Semantic Scholar는 키 없는 공유 풀이라 간헐적으로 429를 반환하며, 429 응답에 CORS 헤더가 없어 브라우저 콘솔에 CORS 오류로 표시된다. 정상 응답 시에는 브라우저에서도 동작한다. 안정화는 Cloudflare Workers 프록시로 처리한다.
- 상류 DB의 메타데이터 오류는 그대로 반영된다. 예를 들어 NeurIPS 2017 논문이 2025년 재등록 DOI로 기록된 사례가 있었다. 이런 경우 필드 불일치로 표시되어 수동 확인을 유도한다.
- 한국어 문헌(KCI)은 Phase 2다. 프록시와 라이선스 확인이 필요하다.
- 자동 판정은 참고용이다. 필드 불일치와 조작 의심 항목은 반드시 원문을 확인해야 한다.
