// 오프라인 실행파일은 용량(약 100MB)이 커서 정적 호스팅 대신 GitHub Releases에 올린다.
// "latest" 경로라 새 릴리스를 올리면 링크를 고치지 않아도 최신 파일을 받는다.
export const OFFLINE_EXE_URL =
  "https://github.com/ssoolee/excelsum/releases/latest/download/excelsum-offline.exe";

// scripts/build-offline.js가 빌드할 때 "1"로 설정한다. 오프라인 exe 안에서는
// 인터넷 링크(exe 다운로드)가 쓸모없으므로 숨기는 데 쓴다.
export const IS_OFFLINE_BUILD = process.env.NEXT_PUBLIC_OFFLINE === "1";
