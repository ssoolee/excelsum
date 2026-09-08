# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

동일 서식의 엑셀 파일 여러 개를 업로드하면 하나로 통합 정리해 다운로드해주는 웹서비스. 요구사항 전체는 `prd.md` 참고. 서버/DB 없이 브라우저에서만 파싱·병합이 이루어지는 순수 정적(static) 앱이다.

## 명령어

```bash
npm run dev      # 개발 서버 (Turbopack, 기본 포트 3000이 사용 중이면 자동으로 다음 포트 사용)
npm run build    # 정적 내보내기 빌드 (next.config.ts의 output: "export"로 인해 out/ 디렉터리 생성)
npm run lint     # ESLint
npx tsc --noEmit # 타입 체크 (별도 test 스크립트 없음)
```

배포:

```bash
npm run build
npx -y firebase-tools@latest deploy --only hosting
```

## 아키텍처

- **핵심 로직은 `src/lib/excel.ts`에 순수 함수로 분리되어 있다.** 엑셀 파싱(`parseExcelFile`), 헤더 비교(`diffHeaders`/`headersMatch`/`describeHeaderDiff`), 병합(`mergeParsedFiles`), 결과 파일 생성(`buildWorkbookBlob`)이 UI와 독립적으로 테스트 가능하다. 파싱/생성 라이브러리는 `exceljs`를 쓴다 — npm의 `xlsx` 패키지는 패치되지 않은 고위험 취약점(프로토타입 오염, ReDoS)이 있어 의도적으로 배제했다.
- **전체 흐름은 `src/app/page.tsx`에서 조율된다.** 업로드된 파일들을 순차적으로(await 반복) 파싱하는데, 이는 "가장 먼저 정상 파싱된 파일의 헤더를 기준 서식으로 삼는다"는 규칙을 레이스 컨디션 없이 구현하기 위함이다. 이후 파일들은 이 기준과 헤더가 다르면 `mismatch` 상태로 분리되고 병합 대상에서 제외된다.
- **서버가 없다.** `next.config.ts`에 `output: "export"`가 설정되어 있어 완전한 정적 사이트로 빌드된다. API 라우트, 서버 컴포넌트의 동적 데이터 페칭, `params`/`searchParams` 등 Next.js의 서버 전용 기능은 이 프로젝트에 적용되지 않는다(적용 시 정적 빌드가 깨진다).
- **반응형은 미디어 쿼리보다 컨테이너 쿼리/`clamp()`/grid `auto-fit`을 우선한다.** 예: `src/components/FileStatusList.module.css`의 카드 레이아웃은 뷰포트가 아니라 카드가 놓인 컨테이너 폭 기준으로 줄바꿈한다. PC↔모바일처럼 레이아웃 자체가 바뀌는 큰 분기(`src/app/page.module.css`의 760px)에만 `@media`를 쓴다.
- **`.claude/agents/`에 이 프로젝트 전용 서브에이전트 5개**(prd-manager, frontend-ui, excel-merge-engine, qa-tester, devops-deploy)가 정의되어 있다. 각자 맡은 영역이 다르니, 해당 영역 작업 시 먼저 읽어볼 것.

## Next.js 버전 관련 주의

이 프로젝트는 Next.js 16(App Router, Turbopack 기본)을 쓴다. 학습 데이터 시점과 규칙이 다를 수 있으므로, 서버 전용 API(`params`, `searchParams`, `cookies`, `headers`, `middleware`→`proxy` 등)를 다뉼 일이 생기면 코드 작성 전에 `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`를 먼저 확인할 것. 단, 이 프로젝트는 정적 내보내기라 대부분의 서버 전용 기능은 애초에 쓰지 않는다.

## 배포 정보

- Firebase 프로젝트 ID: `excelsum-app` (`.firebaserc`)
- Hosting URL: https://excelsum-app.web.app
- GitHub: https://github.com/ssoolee/excelsum

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
