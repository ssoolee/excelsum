import ExcelJS from "exceljs";

type CellStyle = Partial<ExcelJS.Style>;

export interface ParsedFile {
  fileName: string;
  headers: string[];
  rows: unknown[][];
  headerCellStyles: (CellStyle | undefined)[];
  columnWidths: (number | undefined)[];
  dataNumberFormats: (string | undefined)[];
}

export interface HeaderDiff {
  missing: string[];
  extra: string[];
  reordered: boolean;
}

export interface MergedResult {
  headers: string[];
  rows: unknown[][];
  headerCellStyles: (CellStyle | undefined)[];
  columnWidths: (number | undefined)[];
  dataNumberFormats: (string | undefined)[];
}

export const MAX_FILES = 50;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const SOURCE_COLUMN = "출처 파일";
const PREVIEW_ROW_LIMIT = 200;

interface RichTextValue {
  richText: { text: string }[];
}

interface FormulaValue {
  result?: unknown;
  formula?: string;
}

interface HyperlinkValue {
  text?: unknown;
  hyperlink?: string;
}

const isRichText = (value: unknown): value is RichTextValue =>
  typeof value === "object" && value !== null && Array.isArray((value as RichTextValue).richText);

const isFormula = (value: unknown): value is FormulaValue =>
  typeof value === "object" && value !== null && "formula" in value;

const isHyperlink = (value: unknown): value is HyperlinkValue =>
  typeof value === "object" && value !== null && "hyperlink" in value;

const normalizeCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (isRichText(value)) return value.richText.map((r) => r.text).join("").trim();
  if (isFormula(value)) return normalizeCell(value.result);
  if (isHyperlink(value)) return normalizeCell(value.text);
  if (value instanceof Date) return value.toLocaleDateString("ko-KR");
  return String(value).trim();
};

const isRowEmpty = (row: unknown[]): boolean =>
  row.every((cell) => normalizeCell(cell) === "");

const HEADER_SEARCH_LIMIT = 20;

function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; headers: string[] } | null {
  const lastRow = Math.min(sheet.rowCount, HEADER_SEARCH_LIMIT);
  for (let r = 1; r <= lastRow; r++) {
    const candidate: string[] = [];
    sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      candidate[colNumber - 1] = normalizeCell(cell.value);
    });
    while (candidate.length && candidate[candidate.length - 1] === "") {
      candidate.pop();
    }
    // 병합된 제목 셀은 병합 범위의 모든 칸에 같은 값이 채워져 나오므로,
    // "채워진 칸 수"가 아니라 "서로 다른 값의 개수"로 헤더 행인지 판단한다.
    const uniqueFilledValues = new Set(candidate.filter((c) => c !== ""));
    if (uniqueFilledValues.size >= 2) {
      return { rowNumber: r, headers: candidate };
    }
  }
  return null;
}

export async function parseExcelFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("시트를 찾을 수 없습니다.");
  }

  const found = findHeaderRow(sheet);
  if (!found) {
    throw new Error(
      `헤더 행을 찾을 수 없습니다. 파일 처음 ${HEADER_SEARCH_LIMIT}행 안에 컬럼명이 2개 이상 있는 행이 필요합니다.`
    );
  }
  const { rowNumber: headerRowNumber, headers } = found;

  const headerRowRef = sheet.getRow(headerRowNumber);
  const headerCellStyles: (CellStyle | undefined)[] = [];
  const columnWidths: (number | undefined)[] = [];
  for (let c = 1; c <= headers.length; c++) {
    headerCellStyles[c - 1] = { ...headerRowRef.getCell(c).style };
    columnWidths[c - 1] = sheet.getColumn(c).width;
  }

  const rows: unknown[][] = [];
  const dataNumberFormats: (string | undefined)[] = [];
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: unknown[] = [];
    for (let c = 1; c <= headers.length; c++) {
      values[c - 1] = normalizeCellValue(row.getCell(c).value);
    }
    if (!isRowEmpty(values)) {
      if (rows.length === 0) {
        for (let c = 1; c <= headers.length; c++) {
          dataNumberFormats[c - 1] = row.getCell(c).numFmt;
        }
      }
      rows.push(values);
    }
  }

  return { fileName: file.name, headers, rows, headerCellStyles, columnWidths, dataNumberFormats };
}

function normalizeCellValue(value: unknown): unknown {
  if (isRichText(value)) return value.richText.map((r) => r.text).join("");
  if (isFormula(value)) return normalizeCellValue(value.result);
  if (isHyperlink(value)) return normalizeCellValue(value.text);
  return value;
}

export function diffHeaders(reference: string[], target: string[]): HeaderDiff {
  const refSet = new Set(reference);
  const targetSet = new Set(target);
  const missing = reference.filter((h) => !targetSet.has(h));
  const extra = target.filter((h) => !refSet.has(h));
  const reordered =
    missing.length === 0 &&
    extra.length === 0 &&
    reference.join(" ") !== target.join(" ");
  return { missing, extra, reordered };
}

export function headersMatch(diff: HeaderDiff): boolean {
  return diff.missing.length === 0 && diff.extra.length === 0 && !diff.reordered;
}

export function describeHeaderDiff(diff: HeaderDiff): string {
  const parts: string[] = [];
  if (diff.missing.length) parts.push(`누락된 컬럼: ${diff.missing.join(", ")}`);
  if (diff.extra.length) parts.push(`추가된 컬럼: ${diff.extra.join(", ")}`);
  if (diff.reordered) parts.push("컬럼 순서가 다릅니다");
  return parts.join(" · ");
}

export function mergeParsedFiles(files: ParsedFile[]): MergedResult {
  const template = files[0];
  const headers = [...template.headers, SOURCE_COLUMN];
  const rows: unknown[][] = [];
  for (const f of files) {
    for (const row of f.rows) {
      rows.push([...row, f.fileName]);
    }
  }
  return {
    headers,
    rows,
    headerCellStyles: [...template.headerCellStyles, undefined],
    columnWidths: [...template.columnWidths, undefined],
    dataNumberFormats: [...template.dataNumberFormats, undefined],
  };
}

export function previewRows(merged: MergedResult): {
  rows: unknown[][];
  truncated: boolean;
} {
  return {
    rows: merged.rows.slice(0, PREVIEW_ROW_LIMIT),
    truncated: merged.rows.length > PREVIEW_ROW_LIMIT,
  };
}

const DEFAULT_COLUMN_WIDTH = 16;

export async function buildWorkbookBlob(merged: MergedResult): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("통합결과");
  sheet.addRow(merged.headers);
  for (const row of merged.rows) {
    sheet.addRow(row);
  }

  const headerRow = sheet.getRow(1);
  merged.headers.forEach((_, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = merged.columnWidths[i] ?? DEFAULT_COLUMN_WIDTH;

    const capturedStyle = merged.headerCellStyles[i];
    const headerCell = headerRow.getCell(i + 1);
    if (capturedStyle) {
      headerCell.style = capturedStyle;
    } else {
      headerCell.font = { bold: true };
    }
  });

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    merged.headers.forEach((_, i) => {
      const numFmt = merged.dataNumberFormats[i];
      if (numFmt) {
        row.getCell(i + 1).numFmt = numFmt;
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function buildDownloadFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
  return `통합결과_${stamp}.xlsx`;
}
