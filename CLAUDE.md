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

앞으로 "배포"를 요청받으면 Firebase와 Vercel 두 곳 모두에 동시에 배포한다.

```bash
npm run build
npx -y firebase-tools@latest deploy --only hosting   # https://excelsum.web.app (기존 excelsum-app.web.app은 새 주소로 301 리다이렉트)
npx -y vercel deploy --prod --yes                     # https://excelsum-two.vercel.app (Vercel 프로젝트명: excelsum)
```

오프라인 실행 파일 만들기:

행정정보망처럼 외부 인터넷 접속이 막힌 PC에서 쓸 수 있도록, Node.js SEA(Single Executable Application) 기능으로 실행 파일 하나에 앱 전체를 담아 배포할 수 있다.

```bash
npm run build:offline   # dist-offline/excelsum-offline.exe 생성
```

생성된 `excelsum-offline.exe` **파일 하나만** USB나 내부 공유폴더로 옮기면 된다(정적 파일이 exe 안에 내장되어 있어 폴더째로 옮길 필요 없음). 대상 PC에서 더블클릭하면 로컬 서버가 뜨고 기본 브라우저가 자동으로 열린다 — 인터넷 연결도, 별도 설치도 필요 없다. 콘솔 창을 닫으면 서비스가 종료된다.

첫 화면과 `/guide`의 exe 다운로드 링크는 GitHub Releases의 `releases/latest/download/excelsum-offline.exe`를 가리킨다(`src/lib/links.ts`). exe를 새로 빌드하면 새 릴리스에 `excelsum-offline.exe`라는 이름으로 첨부해야 링크가 최신 파일을 받는다. 오프라인 빌드는 `NEXT_PUBLIC_OFFLINE=1`로 빌드되어 exe 안에서는 이 링크가 숨겨진다 — 그래서 `build:offline` 직후의 `out/`은 오프라인용이니, 웹 배포 전에는 반드시 `npm run build`를 다시 실행할 것.

주의: 서명되지 않은 exe라 Windows SmartScreen이나 백신이 경고할 수 있다("추가 정보 → 실행"으로 우회 가능). 조직 보안 정책상 출처 불명 exe 실행 자체가 차단된 PC라면 IT 부서의 예외 승인이 필요하며, 이는 코드로 해결할 수 없는 정책 영역이다. 파일 크기는 Node 런타임 전체를 포함하므로 약 80~100MB로 크다.

## 아키텍처

- **핵심 로직은 `src/lib/excel.ts`에 순수 함수로 분리되어 있다.** 엑셀 파싱(`parseExcelFile`), 헤더 비교(`diffHeaders`/`headersMatch`/`describeHeaderDiff`), 병합(`mergeParsedFiles`), 결과 파일 생성(`buildWorkbookBlob`)이 UI와 독립적으로 테스트 가능하다. 파싱/생성 라이브러리는 `exceljs`를 쓴다 — npm의 `xlsx` 패키지는 패치되지 않은 고위험 취약점(프로토타입 오염, ReDoS)이 있어 의도적으로 배제했다.
- **CFB(OLE2) 컨테이너 읽기는 `src/lib/cfb.ts`가 맡는다.** 암호가 걸린 xlsx와 구형 `.xls`가 모두 이 형식이라, 스트림을 이름으로 꺼내 주는 읽기 전용 리더를 둘이 공유한다.
- **암호가 걸린 파일 복호화는 `src/lib/officeCrypto.ts`가 담당한다.** 열기 암호가 걸린 xlsx는 zip이 아니라 CFB 컨테이너여서 ExcelJS가 바로 읽지 못한다. 이 모듈이 MS-OFFCRYPTO 복호화(Agile/Standard)를 직접 구현하고, `parseExcelFile(file, password)`이 그 결과를 ExcelJS에 넘긴다. 해시/AES만 `@noble/hashes`·`@noble/ciphers`(무의존·감사됨)를 쓰며 Node 전용 API를 쓰지 않아 정적 빌드·오프라인 exe·Node 검증 스크립트에서 같은 코드가 돈다. 암호는 `page.tsx`의 ref에만 머물고 저장·전송하지 않으며, 공통 암호 1회 입력과 파일별 암호 입력(파일마다 암호가 다른 경우)을 모두 지원한다.
- **구형 엑셀(.xls, Excel 97-2003) 읽기는 `src/lib/xlsReader.ts`가 맡는다.** BIFF8 레코드에서 값만 뽑아 ExcelJS 워크북으로 옮겨 담으므로(`excel.ts`의 `workbookFromXls`), 헤더 인식·병합·다운로드 경로는 xlsx와 완전히 같다. 파일 종류는 확장자가 아니라 내용(zip/CFB 시그니처)으로 가린다. 열기 암호가 걸린 `.xls`는 `src/lib/xlsCrypto.ts`가 푼다 — FilePass 레코드를 읽어 RC4(Office 97/2000)·RC4 CryptoAPI(Office XP 이후) 두 방식을 처리하며, 레코드 머리말과 BOF·FilePass·BoundSheet8 앞 4바이트 등 평문 구간을 건너뛰되 키 스트림은 흘려보내고 1024바이트마다 키를 바꾼다. XOR 난독화와 Excel 95 이전 형식만 이유를 안내하고 열지 않는다.
- **개발용 검증 스크립트**(둘 다 `--import ./scripts/ts-resolve.mjs`가 필요하다 — src가 확장자 없는 상대 import를 쓰기 때문):
  - 암호 파일: `node --import ./scripts/ts-resolve.mjs scripts/verify-decrypt.ts <픽스처_폴더> [<standard파일>::<암호>]` (픽스처는 `npx officecrypto-tool`의 `encrypt`로 생성)
  - 구형 .xls: `node --import ./scripts/ts-resolve.mjs scripts/verify-xls.ts <픽스처_폴더>` (픽스처는 파이썬 `xlwt`와 SheetJS `bookType: "biff8"`로 생성)
  두 생성 도구 모두 개발용이라 프로젝트 의존성에는 넣지 않았다.
- **전체 흐름은 `src/app/page.tsx`에서 조율된다.** 업로드된 파일들을 순차적으로(await 반복) 파싱하는데, 이는 "가장 먼저 정상 파싱된 파일의 헤더를 기준 서식으로 삼는다"는 규칙을 레이스 컨디션 없이 구현하기 위함이다. 이후 파일들은 이 기준과 헤더가 다르면 `mismatch` 상태로 분리되고 병합 대상에서 제외된다.
- **서버가 없다.** `next.config.ts`에 `output: "export"`가 설정되어 있어 완전한 정적 사이트로 빌드된다. API 라우트, 서버 컴포넌트의 동적 데이터 페칭, `params`/`searchParams` 등 Next.js의 서버 전용 기능은 이 프로젝트에 적용되지 않는다(적용 시 정적 빌드가 깨진다).
- **반응형은 미디어 쿼리보다 컨테이너 쿼리/`clamp()`/grid `auto-fit`을 우선한다.** 예: `src/components/FileStatusList.module.css`의 카드 레이아웃은 뷰포트가 아니라 카드가 놓인 컨테이너 폭 기준으로 줄바꿈한다. PC↔모바일처럼 레이아웃 자체가 바뀌는 큰 분기(`src/app/page.module.css`의 760px)에만 `@media`를 쓴다.
- **`.claude/agents/`에 이 프로젝트 전용 서브에이전트 5개**(prd-manager, frontend-ui, excel-merge-engine, qa-tester, devops-deploy)가 정의되어 있다. 각자 맡은 영역이 다르니, 해당 영역 작업 시 먼저 읽어볼 것.

## Next.js 버전 관련 주의

이 프로젝트는 Next.js 16(App Router, Turbopack 기본)을 쓴다. 학습 데이터 시점과 규칙이 다를 수 있으므로, 서버 전용 API(`params`, `searchParams`, `cookies`, `headers`, `middleware`→`proxy` 등)를 다뉼 일이 생기면 코드 작성 전에 `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`를 먼저 확인할 것. 단, 이 프로젝트는 정적 내보내기라 대부분의 서버 전용 기능은 애초에 쓰지 않는다.

## 배포 정보

- Firebase 프로젝트 ID: `excelsum-app` (`.firebaserc`) — Hosting 사이트 2개(`firebase.json`): 대표 주소 https://excelsum.web.app, 기존 주소 https://excelsum-app.web.app 은 경로·쿼리를 유지한 채 새 주소로 301 리다이렉트만 한다
- Vercel 프로젝트명: `excelsum` (`goznuki` 계정, `.vercel/project.json`) — Production URL: https://excelsum-two.vercel.app
- GitHub: https://github.com/ssoolee/excelsum

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
