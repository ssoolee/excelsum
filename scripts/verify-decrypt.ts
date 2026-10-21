/**
 * 암호 걸린 xlsx 복호화 검증 스크립트(개발용).
 *
 *   node scripts/verify-decrypt.ts <픽스처_폴더>
 *
 * 폴더 안에 plain.xlsx / locked-a.xlsx(암호 1234) / locked-other.xlsx(암호 9999) /
 * locked-big-ko.xlsx(암호 한글암호!@#)가 있다고 보고 검사한다. 픽스처 만드는 방법은
 * CLAUDE.md의 "암호 파일 검증" 항목 참고. Node 24는 .ts를 그대로 실행한다.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  WrongPasswordError,
  decryptOfficeFile,
  isEncryptedOfficeFile,
} from "../src/lib/officeCrypto.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("사용법: node scripts/verify-decrypt.ts <픽스처_폴더>");
  process.exit(1);
}

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

async function load(fileName: string) {
  return new Uint8Array(await readFile(path.join(dir, fileName)));
}

async function sheetOf(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
  return workbook.worksheets[0];
}

const plain = await load("plain.xlsx");
check("평범한 xlsx는 암호 파일로 보지 않는다", !isEncryptedOfficeFile(plain));

const lockedA = await load("locked-a.xlsx");
check("암호 걸린 xlsx를 알아본다", isEncryptedOfficeFile(lockedA));

{
  const started = performance.now();
  const decrypted = decryptOfficeFile(lockedA, "1234");
  const elapsed = Math.round(performance.now() - started);
  const sheet = await sheetOf(decrypted);
  const header = sheet.getRow(2).values as unknown[];
  check(
    "Agile: 복호화 후 ExcelJS로 읽힌다",
    header.slice(1, 4).join(",") === "부서,담당자,금액",
    `헤더=${header.slice(1, 4).join(",")} · ${elapsed}ms`
  );
  check("Agile: 데이터 행이 보존된다", sheet.getCell("C3").value === 1200000);
}

{
  let thrown: unknown = null;
  try {
    decryptOfficeFile(lockedA, "0000");
  } catch (error) {
    thrown = error;
  }
  check("틀린 암호는 WrongPasswordError", thrown instanceof WrongPasswordError);
}

{
  const decrypted = decryptOfficeFile(await load("locked-other.xlsx"), "9999");
  const sheet = await sheetOf(decrypted);
  check("다른 암호가 걸린 파일도 해당 암호로 열린다", sheet.getCell("A3").value === "재무과");
}

{
  // 4096바이트 세그먼트가 여러 개인 파일 + 한글/기호 섞인 암호
  const started = performance.now();
  const decrypted = decryptOfficeFile(await load("locked-big-ko.xlsx"), "한글암호!@#");
  const elapsed = Math.round(performance.now() - started);
  const sheet = await sheetOf(decrypted);
  check(
    "여러 세그먼트 + 한글 암호",
    sheet.getCell("A402").value === "부서399",
    `${elapsed}ms`
  );
}

const standard = process.argv[3];
if (standard) {
  const [file, password] = standard.split("::");
  const decrypted = decryptOfficeFile(new Uint8Array(await readFile(file)), password);
  const sheet = await sheetOf(decrypted);
  check(
    "Standard(Excel 2007) 암호화도 열린다",
    sheet.rowCount > 0,
    `${sheet.rowCount}행 · 첫 셀=${String(sheet.getCell("A1").value)}`
  );
}

console.log(failures === 0 ? "\n전부 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
