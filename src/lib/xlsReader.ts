/**
 * 구형 엑셀 파일(.xls, Excel 97-2003)에서 시트별 값만 읽어 오는 최소 BIFF8 리더.
 *
 * .xls는 xlsx(zip)와 전혀 다른 형식이라 ExcelJS가 읽지 못한다. CFB 컨테이너(cfb.ts) 안의
 * "Workbook" 스트림에 레코드들이 줄줄이 들어 있고, 그중 값에 해당하는 레코드만 해석하면
 * 헤더/데이터 행을 뽑을 수 있다. 수식은 저장된 계산 결과를 쓰고, 서식은 날짜 판별과
 * 표시 형식 승계에 필요한 만큼(FORMAT/XF)만 읽는다. 쓰기는 지원하지 않는다.
 *
 * 지원 범위: BIFF8(Excel 97-2003). 열기 암호가 걸린 파일은 xlsCrypto.ts가 먼저 풀어 주고,
 * 그보다 오래된 형식(Excel 95 이하)은 UnsupportedXlsError로 분명히 알린다.
 */
import { decryptXlsStream, isEncryptedXlsStream } from "./xlsCrypto";

/** 암호가 필요한데 받지 못했을 때(실제 분기는 excel.ts가 먼저 한다). */
export class EncryptedXlsError extends Error {
  constructor(message = "암호가 걸린 파일입니다.") {
    super(message);
    this.name = "EncryptedXlsError";
  }
}

/** BIFF8보다 오래된 형식 등 다룰 수 없는 .xls. */
export class UnsupportedXlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedXlsError";
  }
}

export interface XlsCell {
  value: unknown;
  /** 엑셀 표시 형식 문자열(숫자/날짜 서식 승계용). */
  numFmt?: string;
}

export interface XlsSheet {
  name: string;
  /** rows[행][열] — 빈 칸은 undefined. 0부터 시작하는 인덱스. */
  rows: (XlsCell | undefined)[][];
  columnWidths: (number | undefined)[];
}

// 필요한 레코드만 추린 목록(그 밖의 레코드는 건너뛴다).
const SID = {
  FORMULA: 0x0006,
  EOF: 0x000a,
  CALCCOUNT: 0x000c,
  DATEMODE: 0x0022,
  FILEPASS: 0x002f,
  CONTINUE: 0x003c,
  COLINFO: 0x007d,
  BOUNDSHEET: 0x0085,
  MULRK: 0x00bd,
  MULBLANK: 0x00be,
  SST: 0x00fc,
  LABELSST: 0x00fd,
  BLANK: 0x0201,
  NUMBER: 0x0203,
  LABEL: 0x0204,
  BOOLERR: 0x0205,
  STRING: 0x0207,
  RK: 0x027e,
  XF: 0x00e0,
  FORMAT: 0x041e,
  BOF: 0x0809,
} as const;

const BIFF8_VERSION = 0x0600;
const MAX_ROWS = 65536;
const MAX_COLS = 256;

/** CONTINUE 레코드까지 이어 붙인 하나의 레코드. boundaries는 이어 붙은 지점(문자열 해석에 필요). */
interface RawRecord {
  sid: number;
  data: Uint8Array;
  boundaries: Set<number>;
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * 스트림을 레코드 단위로 훑는다. 길이가 8224바이트를 넘는 레코드는 CONTINUE로 쪼개져 있으므로
 * 이어 붙이고, 이어 붙인 지점을 기억해 둔다(SST 문자열이 그 경계에서 인코딩 표시 바이트를 한 번 더 갖는다).
 */
function* readRecords(stream: Uint8Array, start = 0): Generator<RawRecord> {
  let pos = start;
  while (pos + 4 <= stream.length) {
    const sid = stream[pos] | (stream[pos + 1] << 8);
    const size = stream[pos + 2] | (stream[pos + 3] << 8);
    const body = stream.subarray(pos + 4, Math.min(pos + 4 + size, stream.length));
    pos += 4 + size;

    const parts = [body];
    const boundaries = new Set<number>();
    let merged = body.length;
    while (pos + 4 <= stream.length && (stream[pos] | (stream[pos + 1] << 8)) === SID.CONTINUE) {
      const contSize = stream[pos + 2] | (stream[pos + 3] << 8);
      parts.push(stream.subarray(pos + 4, Math.min(pos + 4 + contSize, stream.length)));
      boundaries.add(merged);
      merged += contSize;
      pos += 4 + contSize;
    }

    yield { sid, data: concat(parts), boundaries };
  }
}

/** 레코드 안을 앞에서부터 읽어 나가는 커서. */
class RecordReader {
  private rec: RawRecord;
  private view: DataView;
  pos = 0;

  constructor(rec: RawRecord) {
    this.rec = rec;
    this.view = new DataView(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength);
  }

  get length(): number {
    return this.rec.data.length;
  }

  u8(): number {
    return this.view.getUint8(this.pos++);
  }

  u16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  skip(n: number): void {
    this.pos += n;
  }

  /**
   * BIFF8 문자열. cchBytes는 글자 수 필드의 크기(1 또는 2),
   * rich는 서식/발음 정보가 뒤따를 수 있는 형태(SST 문자열)인지.
   */
  text(cchBytes: 1 | 2, rich = false): string {
    const cch = cchBytes === 2 ? this.u16() : this.u8();
    const grbit = this.u8();
    let wide = (grbit & 0x01) !== 0;
    const runCount = rich && (grbit & 0x08) !== 0 ? this.u16() : 0;
    const extSize = rich && (grbit & 0x04) !== 0 ? this.u32() : 0;

    let out = "";
    for (let i = 0; i < cch; i++) {
      // CONTINUE 경계에서는 남은 글자의 인코딩을 알리는 바이트가 한 번 더 들어간다.
      if (this.rec.boundaries.has(this.pos)) {
        wide = (this.u8() & 0x01) !== 0;
      }
      if (this.pos >= this.length) break;
      out += String.fromCharCode(wide ? this.u16() : this.u8());
    }
    this.skip(runCount * 4 + extSize);
    return out;
  }
}

/** RK 레코드의 압축 숫자 표현을 실수로 되돌린다. */
function rkToNumber(rk: number): number {
  const isX100 = (rk & 0x01) !== 0;
  const isInt = (rk & 0x02) !== 0;
  let value: number;
  if (isInt) {
    value = (rk | 0) >> 2;
  } else {
    // RK는 실수의 상위 32비트만 담고 있다. 나머지 32비트는 0으로 두고 읽는다.
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(0, rk & 0xfffffffc, false);
    value = view.getFloat64(0, false);
  }
  return isX100 ? value / 100 : value;
}

// 엑셀 기본 제공 표시 형식 중 날짜/시간에 해당하는 번호와 형식 문자열.
const BUILTIN_FORMATS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "mm-dd-yy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

// 한국/일본어 환경에서 쓰이는 번호대는 모두 날짜·시간 형식이다.
const CJK_DATE_FORMAT_IDS = (() => {
  const ids = new Set<number>();
  for (let i = 27; i <= 36; i++) ids.add(i);
  for (let i = 50; i <= 58; i++) ids.add(i);
  return ids;
})();

/** 표시 형식 문자열이 날짜/시간을 뜻하는지 본다(따옴표 안 글자와 [조건]·색 지정은 빼고 판단). */
function isDateFormat(format: string): boolean {
  const stripped = format
    .replace(/\\./g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[ymdhs]/i.test(stripped);
}

/** 엑셀 날짜 일련번호를 Date로. 1900 체계의 윤년 버그는 기준일을 1899-12-30으로 두어 흡수한다. */
function serialToDate(serial: number, is1904: boolean): Date {
  const base = is1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(base + Math.round(serial * 86400000));
}

interface WorkbookContext {
  strings: string[];
  /** XF 인덱스 → 표시 형식 번호 */
  xfFormatIds: number[];
  /** 표시 형식 번호 → 형식 문자열 */
  formats: Map<number, string>;
  is1904: boolean;
}

/** 셀의 표시 형식 문자열을 찾는다(없으면 undefined). */
function formatOf(ctx: WorkbookContext, ixfe: number): { fmt?: string; isDate: boolean } {
  const ifmt = ctx.xfFormatIds[ixfe];
  if (ifmt === undefined) return { isDate: false };
  const fmt = ctx.formats.get(ifmt) ?? BUILTIN_FORMATS[ifmt];
  if (fmt === undefined) {
    return { isDate: CJK_DATE_FORMAT_IDS.has(ifmt) };
  }
  return {
    fmt: fmt === "General" ? undefined : fmt,
    isDate: CJK_DATE_FORMAT_IDS.has(ifmt) || isDateFormat(fmt),
  };
}

interface SheetInfo {
  name: string;
  offset: number;
  isWorksheet: boolean;
}

/** 워크북 전역 영역(첫 BOF ~ EOF)에서 시트 목록·공유 문자열·서식을 읽는다. */
function readGlobals(stream: Uint8Array): { sheets: SheetInfo[]; ctx: WorkbookContext } {
  const sheets: SheetInfo[] = [];
  const ctx: WorkbookContext = {
    strings: [],
    xfFormatIds: [],
    formats: new Map(),
    is1904: false,
  };

  let seenBof = false;
  for (const rec of readRecords(stream)) {
    if (rec.sid === SID.BOF) {
      if (seenBof) break;
      seenBof = true;
      const reader = new RecordReader(rec);
      const version = reader.u16();
      if (version !== BIFF8_VERSION) {
        throw new UnsupportedXlsError(
          "Excel 95 이전 형식의 .xls 파일입니다. 엑셀에서 열어 .xlsx 또는 Excel 97-2003 형식으로 다시 저장해 주세요."
        );
      }
      continue;
    }
    if (rec.sid === SID.EOF) break;

    const reader = new RecordReader(rec);
    switch (rec.sid) {
      case SID.BOUNDSHEET: {
        const offset = reader.u32();
        reader.u8(); // 표시 상태(숨김 여부) — 숨은 시트도 그대로 읽는다.
        const sheetType = reader.u8();
        sheets.push({ name: reader.text(1), offset, isWorksheet: sheetType === 0 });
        break;
      }
      case SID.SST: {
        reader.u32(); // 전체 문자열 수(중복 포함)
        const unique = reader.u32();
        for (let i = 0; i < unique && reader.pos < reader.length; i++) {
          ctx.strings.push(reader.text(2, true));
        }
        break;
      }
      case SID.FORMAT: {
        const ifmt = reader.u16();
        ctx.formats.set(ifmt, reader.text(2));
        break;
      }
      case SID.XF: {
        reader.u16(); // 글꼴 번호
        ctx.xfFormatIds.push(reader.u16());
        break;
      }
      case SID.DATEMODE:
        ctx.is1904 = reader.u16() !== 0;
        break;
      default:
        break;
    }
  }

  if (!seenBof) {
    throw new UnsupportedXlsError("엑셀 파일 구조를 읽을 수 없습니다(BOF 레코드 없음).");
  }
  return { sheets, ctx };
}

/** 시트 하나의 셀 값을 읽는다. */
function readSheet(stream: Uint8Array, info: SheetInfo, ctx: WorkbookContext): XlsSheet {
  const rows: (XlsCell | undefined)[][] = [];
  const columnWidths: (number | undefined)[] = [];
  // FORMULA의 결과가 문자열이면 바로 다음 STRING 레코드에 값이 들어 있다.
  let pendingStringCell: { row: number; col: number } | null = null;

  const put = (row: number, col: number, value: unknown, ixfe: number) => {
    if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) return;
    const { fmt, isDate } = formatOf(ctx, ixfe);
    let finalValue = value;
    if (isDate && typeof value === "number" && Number.isFinite(value)) {
      finalValue = serialToDate(value, ctx.is1904);
    }
    if (!rows[row]) rows[row] = [];
    rows[row][col] = { value: finalValue, numFmt: fmt };
  };

  for (const rec of readRecords(stream, info.offset)) {
    if (rec.sid === SID.EOF) break;
    const reader = new RecordReader(rec);

    switch (rec.sid) {
      case SID.BOF:
        break;
      case SID.COLINFO: {
        const first = reader.u16();
        const last = reader.u16();
        const width = reader.u16() / 256; // 1/256 글자 단위
        for (let c = first; c <= Math.min(last, MAX_COLS - 1); c++) {
          columnWidths[c] = width;
        }
        break;
      }
      case SID.LABELSST: {
        const row = reader.u16();
        const col = reader.u16();
        const ixfe = reader.u16();
        put(row, col, ctx.strings[reader.u32()] ?? "", ixfe);
        break;
      }
      case SID.LABEL: {
        const row = reader.u16();
        const col = reader.u16();
        const ixfe = reader.u16();
        put(row, col, reader.text(2), ixfe);
        break;
      }
      case SID.NUMBER: {
        const row = reader.u16();
        const col = reader.u16();
        const ixfe = reader.u16();
        put(row, col, reader.f64(), ixfe);
        break;
      }
      case SID.RK: {
        const row = reader.u16();
        const col = reader.u16();
        const ixfe = reader.u16();
        put(row, col, rkToNumber(reader.i32()), ixfe);
        break;
      }
      case SID.MULRK: {
        const row = reader.u16();
        const firstCol = reader.u16();
        // 마지막 2바이트는 끝 열 번호라서, 그 앞까지가 (서식 2 + 값 4)바이트 묶음이다.
        for (let col = firstCol; reader.pos + 6 <= reader.length - 2; col++) {
          const ixfe = reader.u16();
          put(row, col, rkToNumber(reader.i32()), ixfe);
        }
        break;
      }
      case SID.BOOLERR: {
        const row = reader.u16();
        const col = reader.u16();
        const ixfe = reader.u16();
        const raw = reader.u8();
        const isError = reader.u8() !== 0;
        put(row, col, isError ? "" : raw !== 0, ixfe);
        break;
      }
      case SID.FORMULA: {
        const row = reader.u16();
        const col = reader.u16();
        const ixfe = reader.u16();
        const b0 = reader.u8();
        reader.u8();
        const b2 = reader.u8();
        reader.skip(3);
        const marker = reader.u16();
        if (marker === 0xffff) {
          // 계산 결과가 숫자가 아닌 경우: 0 문자열(다음 STRING 레코드), 1 참/거짓, 2 오류, 3 빈 문자열
          if (b0 === 0) {
            pendingStringCell = { row, col };
          } else if (b0 === 1) {
            put(row, col, b2 !== 0, ixfe);
          } else if (b0 === 2) {
            put(row, col, "", ixfe);
          } else {
            put(row, col, "", ixfe);
          }
        } else {
          reader.pos -= 8;
          put(row, col, reader.f64(), ixfe);
        }
        break;
      }
      case SID.STRING: {
        if (pendingStringCell) {
          const { row, col } = pendingStringCell;
          pendingStringCell = null;
          if (!rows[row]) rows[row] = [];
          rows[row][col] = { value: reader.text(2) };
        }
        break;
      }
      default:
        break;
    }
  }

  return { name: info.name, rows, columnWidths };
}

/** Workbook 스트림 전체를 읽어 시트별 값으로 돌려준다. 암호가 걸려 있으면 먼저 복호화한다. */
export function readXlsWorkbook(workbookStream: Uint8Array, password?: string): XlsSheet[] {
  let stream = workbookStream;
  if (isEncryptedXlsStream(stream)) {
    if (!password) throw new EncryptedXlsError();
    stream = decryptXlsStream(stream, password);
  }

  const { sheets, ctx } = readGlobals(stream);
  const worksheets = sheets.filter((s) => s.isWorksheet);
  if (worksheets.length === 0) {
    throw new UnsupportedXlsError("시트를 찾을 수 없습니다.");
  }
  return worksheets.map((info) => readSheet(stream, info, ctx));
}
