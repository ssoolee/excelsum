/**
 * 구형 엑셀(.xls, BIFF8) 읽기 검증 스크립트(개발용).
 *
 *   node scripts/verify-xls.ts <픽스처_폴더>
 *
 * 폴더 안에 xls-same.xls / xls-mismatch.xls / xls-types.xls / xls-multi.xls /
 * xls-cached-formula.xls / xls-rc4-1234.xls(암호 1234) / xls-rc4-ko.xls(암호 한글암호!@#)가
 * 있다고 보고 검사한다. 앞의 넷은 파이썬 xlwt(`pip install xlwt`)로, 수식 결과가 저장된 파일은
 * SheetJS(`XLSX.writeFile(..., { bookType: "biff8" })`)로, 암호 걸린 두 개는 엑셀에서
 * "다른 이름으로 저장 → 도구 → 일반 옵션 → 열기 암호"로 .xls(Excel 97-2003)로 저장해 만든다
 * — 생성 도구는 개발용이라 프로젝트 의존성에는 넣지 않았다.
 * Node 24는 .ts를 그대로 실행한다.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  diffHeaders,
  headersMatch,
  mergeParsedFiles,
  parseExcelFile,
  type ParsedFile,
} from "../src/lib/excel.ts";
import { WrongPasswordError } from "../src/lib/officeCrypto.ts";
import { verifyXlsPassword } from "../src/lib/xlsCrypto.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("사용법: node scripts/verify-xls.ts <픽스처_폴더>");
  process.exit(1);
}

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

async function parse(fileName: string, password?: string): Promise<ParsedFile> {
  const bytes = await readFile(path.join(dir, fileName));
  return parseExcelFile(new File([bytes], fileName), password);
}

const same = await parse("xls-same.xls");
check(
  "제목 행이 있어도 헤더를 찾는다",
  same.headers.join(",") === "부서,담당자,금액",
  `헤더=${same.headers.join(",")}`
);
check("데이터 행 수가 맞다", same.rows.length === 2, `${same.rows.length}행`);
check(
  "문자열·숫자 값이 그대로 읽힌다",
  same.rows[0][0] === "영업과" && same.rows[0][2] === 750000,
  JSON.stringify(same.rows[0])
);

const mismatch = await parse("xls-mismatch.xls");
check(
  "컬럼 순서가 다른 .xls는 서식 불일치로 판정된다",
  !headersMatch(diffHeaders(same.headers, mismatch.headers)),
  `헤더=${mismatch.headers.join(",")}`
);

const types = await parse("xls-types.xls");
check("400행을 모두 읽는다", types.rows.length === 400, `${types.rows.length}행`);
check(
  "날짜 서식 셀이 Date로 변환된다",
  types.rows[0][0] instanceof Date &&
    (types.rows[0][0] as Date).toISOString().slice(0, 10) === "2026-02-02",
  String(types.rows[0][0])
);
check(
  "SST가 CONTINUE로 쪼개져도 한글 문자열이 깨지지 않는다",
  types.rows[399][1] ===
    "민원 접수 건 400 · 아주 긴 한글 설명을 넣어 공유 문자열 테이블이 레코드 한도를 넘게 만든다",
  String(types.rows[399][1])
);
// xlwt는 수식의 계산 결과를 저장하지 않으므로(엑셀이 열 때 계산), 이 픽스처에서는 빈 칸이 맞다.
check(
  "계산 결과가 없는 수식 칸은 빈 값으로 둔다",
  types.rows[0][4] === "",
  JSON.stringify(types.rows[0][4])
);
check("참/거짓 값이 읽힌다", types.rows[1][5] === true, String(types.rows[1][5]));
check(
  "숫자 표시 형식이 승계된다",
  types.dataNumberFormats[4] === "#,##0",
  String(types.dataNumberFormats[4])
);

const cached = await parse("xls-cached-formula.xls");
check(
  "수식 셀은 파일에 저장된 계산 결과로 읽힌다",
  cached.rows[1][2] === 1000,
  JSON.stringify(cached.rows[1])
);

const multi = await parse("xls-multi.xls");
check(
  "같은 헤더를 가진 여러 시트가 이어붙는다",
  multi.rows.length === 2,
  `${multi.rows.length}행`
);
check(
  "표가 아닌 시트는 제외하고 알려준다",
  multi.skippedSheets.join(",") === "안내",
  multi.skippedSheets.join(",")
);

// 암호가 걸린 .xls (RC4 CryptoAPI — Office XP 이후가 .xls에 쓰는 방식)
{
  const locked = await parse("xls-rc4-1234.xls", "1234");
  check(
    "암호 걸린 .xls가 열리고 값이 그대로 읽힌다",
    locked.headers.join(",") === "부서,담당자,금액" &&
      locked.rows[0][0] === "감사담당관" &&
      locked.rows[0][2] === 120000,
    JSON.stringify(locked.rows[0])
  );

  const ko = await parse("xls-rc4-ko.xls", "한글암호!@#");
  check("한글 암호가 걸린 .xls도 열린다", ko.rows.length === 2, `${ko.rows.length}행`);

  try {
    await parse("xls-rc4-1234.xls", "0000");
    check("틀린 암호는 WrongPasswordError", false, "예외가 나지 않았다");
  } catch (err) {
    check("틀린 암호는 WrongPasswordError", err instanceof WrongPasswordError, String(err));
  }

  try {
    await parse("xls-rc4-1234.xls");
    check("암호 없이 열면 암호가 필요하다고 알린다", false, "예외가 나지 않았다");
  } catch (err) {
    check(
      "암호 없이 열면 암호가 필요하다고 알린다",
      err instanceof Error && err.name === "EncryptedFileError",
      String(err)
    );
  }
}

// Office 97/2000의 기본 RC4(버전 1.1) 키 유도 — 공개된 참조 구현의 시험값으로 확인한다.
{
  const vector = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
  const filePass = new Uint8Array([
    0x01, 0x00, // 종류: RC4
    0x01, 0x00, // 버전 1
    0x01, 0x00, // .1
    ...vector("e8772c1d91c56a37964761b280183217"), // salt
    ...vector("c9e997d454973d310bb1ba701426837e"), // encryptedVerifier
    ...vector("b1de178f07e989c44dae5e4cf96ac407"), // encryptedVerifierHash
  ]);
  check("구형 RC4(1.1) 암호 검증이 참조 구현과 일치한다", verifyXlsPassword(filePass, "password1"));
  check("구형 RC4(1.1)에서 틀린 암호를 걸러낸다", !verifyXlsPassword(filePass, "password2"));
}

// .xlsx와 .xls를 섞어 병합(헤더가 같으면 한 표로 합쳐져야 한다).
const plainXlsx = await parse("../fixtures/plain.xlsx").catch(() => null);
if (plainXlsx) {
  check(
    "xlsx와 xls의 헤더가 같으면 같은 서식으로 본다",
    headersMatch(diffHeaders(plainXlsx.headers, same.headers)),
    `${plainXlsx.headers.join(",")} vs ${same.headers.join(",")}`
  );
  const merged = mergeParsedFiles([plainXlsx, same]);
  check(
    "xlsx + xls 병합 결과 행 수가 맞다",
    merged.rows.length === plainXlsx.rows.length + same.rows.length,
    `${merged.rows.length}행`
  );
  check(
    "출처 파일 열에 .xls 파일명이 들어간다",
    merged.rows[merged.rows.length - 1].at(-1) === "xls-same.xls",
    String(merged.rows[merged.rows.length - 1].at(-1))
  );
}

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
