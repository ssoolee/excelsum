"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FileUploader } from "@/components/FileUploader";
import { FileStatusList } from "@/components/FileStatusList";
import { Mascot } from "@/components/Mascot";
import { PreviewTable } from "@/components/PreviewTable";
import {
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  buildDownloadFileName,
  buildWorkbookBlob,
  describeHeaderDiff,
  diffHeaders,
  headersMatch,
  mergeParsedFiles,
  parseExcelFile,
  previewRows,
  removeFirstColumnOnlyRows,
  renumberFirstColumn,
  type ParsedFile,
} from "@/lib/excel";
import type { FileEntry } from "@/lib/types";
import styles from "./page.module.css";

interface Item {
  entry: FileEntry;
  parsed?: ParsedFile;
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [renumbered, setRenumbered] = useState(false);
  const [sparseRemoved, setSparseRemoved] = useState(false);
  const referenceHeadersRef = useRef<string[] | null>(null);

  const updateEntry = useCallback((id: string, next: Item) => {
    setItems((prev) => prev.map((it) => (it.entry.id === id ? next : it)));
  }, []);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setWarning(null);

      const remainingSlots = MAX_FILES - items.length;
      const accepted = files.slice(0, Math.max(remainingSlots, 0));
      if (files.length > accepted.length) {
        setWarning(
          `한 번에 최대 ${MAX_FILES}개까지 처리할 수 있어 ${files.length - accepted.length}개 파일은 제외되었습니다.`
        );
      }
      if (accepted.length === 0) return;

      const pending: Item[] = accepted.map((file) => ({
        entry: {
          id: crypto.randomUUID(),
          fileName: file.name,
          status: "processing",
        },
      }));
      setItems((prev) => [...prev, ...pending]);

      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        const id = pending[i].entry.id;

        if (file.size > MAX_FILE_SIZE_BYTES) {
          updateEntry(id, {
            entry: {
              id,
              fileName: file.name,
              status: "error",
              message: "파일 용량이 10MB를 초과합니다.",
            },
          });
          continue;
        }

        try {
          const parsed = await parseExcelFile(file);

          if (parsed.rows.length === 0) {
            updateEntry(id, {
              entry: {
                id,
                fileName: file.name,
                status: "empty",
                message: "헤더만 있고 데이터 행이 없습니다.",
              },
            });
            continue;
          }

          const skippedSheetsMessage =
            parsed.skippedSheets.length > 0
              ? `제외된 시트: ${parsed.skippedSheets.join(", ")} (헤더가 다르거나 표 형태가 아님)`
              : undefined;

          if (!referenceHeadersRef.current) {
            referenceHeadersRef.current = parsed.headers;
            updateEntry(id, {
              entry: {
                id,
                fileName: file.name,
                status: "ok",
                rowCount: parsed.rows.length,
                message: skippedSheetsMessage,
              },
              parsed,
            });
            continue;
          }

          const diff = diffHeaders(referenceHeadersRef.current, parsed.headers);
          if (headersMatch(diff)) {
            updateEntry(id, {
              entry: {
                id,
                fileName: file.name,
                status: "ok",
                rowCount: parsed.rows.length,
                message: skippedSheetsMessage,
              },
              parsed,
            });
          } else {
            updateEntry(id, {
              entry: {
                id,
                fileName: file.name,
                status: "mismatch",
                message: describeHeaderDiff(diff),
              },
            });
          }
        } catch (err) {
          updateEntry(id, {
            entry: {
              id,
              fileName: file.name,
              status: "error",
              message: err instanceof Error ? err.message : "파일을 읽을 수 없습니다.",
            },
          });
        }
      }
    },
    [items.length, updateEntry]
  );

  const merged = useMemo(() => {
    const okParsed = items
      .filter((it) => it.entry.status === "ok" && it.parsed)
      .map((it) => it.parsed as ParsedFile);
    if (okParsed.length === 0) return null;
    return mergeParsedFiles(okParsed);
  }, [items]);

  const sparseRowCount = useMemo(() => {
    if (!merged) return 0;
    return merged.rows.length - removeFirstColumnOnlyRows(merged).rows.length;
  }, [merged]);

  const displayedMerged = useMemo(() => {
    if (!merged) return null;
    let result = merged;
    if (sparseRemoved) result = removeFirstColumnOnlyRows(result);
    if (renumbered) result = renumberFirstColumn(result);
    return result;
  }, [merged, sparseRemoved, renumbered]);

  const preview = useMemo(
    () => (displayedMerged ? previewRows(displayedMerged) : null),
    [displayedMerged]
  );

  const handleDownload = useCallback(async () => {
    if (!displayedMerged) return;
    setIsDownloading(true);
    try {
      const blob = await buildWorkbookBlob(displayedMerged);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildDownloadFileName();
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }, [displayedMerged]);

  const handleReset = useCallback(() => {
    setItems([]);
    setWarning(null);
    setRenumbered(false);
    setSparseRemoved(false);
    referenceHeadersRef.current = null;
  }, []);

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.entry.id !== id);
      const stillHasOk = next.some((it) => it.entry.status === "ok");
      if (!stillHasOk) {
        referenceHeadersRef.current = null;
      }
      return next;
    });
  }, []);

  const okCount = items.filter((it) => it.entry.status === "ok").length;
  const problemCount = items.length - okCount;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Mascot size={64} className={styles.headerMascot} />
        <div>
          <h1 className={styles.heading}>엑셀 통합 정리</h1>
          <p className={styles.subheading}>
            동일한 서식의 엑셀 파일 여러 개를 올리면 하나로 정리해 드립니다.
          </p>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.leftColumn}>
          <FileUploader onFilesSelected={handleFilesSelected} />

          {warning && <p className={styles.warning}>{warning}</p>}

          {items.length > 0 && (
            <div className={styles.summaryRow}>
              <span>
                정상 {okCount}개 · 확인 필요 {problemCount}개
              </span>
              <button type="button" className={styles.resetButton} onClick={handleReset}>
                초기화
              </button>
            </div>
          )}

          <FileStatusList entries={items.map((it) => it.entry)} onRemove={handleRemove} />
        </section>

        <section className={styles.rightColumn}>
          <div className={styles.resultPanel}>
            {displayedMerged && preview ? (
              <>
                <div className={styles.resultHeader}>
                  <h2 className={styles.resultTitle}>통합 결과 미리보기</h2>
                  <div className={styles.resultActions}>
                    {sparseRowCount > 0 && (
                      <button
                        type="button"
                        className={styles.renumberButton}
                        onClick={() => setSparseRemoved((r) => !r)}
                      >
                        {sparseRemoved
                          ? `삭제한 행 복원 (${sparseRowCount}개)`
                          : `첫 칸만 있는 행 삭제 (${sparseRowCount}개)`}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.renumberButton}
                      onClick={() => setRenumbered((r) => !r)}
                    >
                      {renumbered ? "원래 연번으로 되돌리기" : "연번 다시 매기기"}
                    </button>
                    <button
                      type="button"
                      className={styles.downloadButton}
                      onClick={handleDownload}
                      disabled={isDownloading}
                    >
                      {isDownloading ? "생성 중..." : "엑셀 다운로드"}
                    </button>
                  </div>
                </div>
                <PreviewTable
                  headers={displayedMerged.headers}
                  rows={preview.rows}
                  totalRowCount={displayedMerged.rows.length}
                  truncated={preview.truncated}
                />
              </>
            ) : (
              <div className={styles.emptyState}>
                <Mascot size={88} />
                <p className={styles.emptyStateText}>
                  정상 인식된 파일이 쌓이면
                  <br />
                  이곳에 통합 결과 미리보기가 표시됩니다.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
