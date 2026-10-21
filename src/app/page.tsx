"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileUploader } from "@/components/FileUploader";
import { FileStatusList } from "@/components/FileStatusList";
import { Mascot } from "@/components/Mascot";
import { PasswordPanel } from "@/components/PasswordPanel";
import { PreviewTable } from "@/components/PreviewTable";
import {
  EncryptedFileError,
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
  type ParsedFile,
} from "@/lib/excel";
import { UnsupportedEncryptionError, WrongPasswordError } from "@/lib/officeCrypto";
import type { FileEntry, FileStatus } from "@/lib/types";
import { IS_OFFLINE_BUILD, OFFLINE_EXE_URL } from "@/lib/links";
import styles from "./page.module.css";

interface Item {
  entry: FileEntry;
  /** 암호를 입력받은 뒤 다시 읽어야 하므로 원본 File 참조를 들고 있는다. */
  file: File;
  parsed?: ParsedFile;
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  // 암호를 적용하는 동안 파일 상태가 잠시 "처리 중"으로 바뀌어도 패널이 사라지지 않게 개수를 따로 기억한다.
  const [unlockingCount, setUnlockingCount] = useState(0);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [sparseRemoved, setSparseRemoved] = useState(false);
  const referenceHeadersRef = useRef<string[] | null>(null);
  // 한 번 통한 암호들은 이후 추가 업로드되는 파일에도 자동으로 써 본다(암호를 다시 묻지 않기 위함).
  const knownPasswordsRef = useRef<string[]>([]);

  const updateEntry = useCallback((id: string, next: Item) => {
    setItems((prev) => prev.map((it) => (it.entry.id === id ? next : it)));
  }, []);

  /** 파일 하나를 읽어 상태를 갱신하고, 결정된 상태를 돌려준다(업로드 직후·암호 적용 때 모두 같은 경로). */
  const processFile = useCallback(
    async (file: File, id: string, password?: string): Promise<FileStatus> => {
      const setStatus = (status: FileStatus, extra: Partial<FileEntry> = {}, parsed?: ParsedFile) => {
        updateEntry(id, {
          file,
          parsed,
          entry: { id, fileName: file.name, status, ...extra },
        });
        return status;
      };

      if (file.size > MAX_FILE_SIZE_BYTES) {
        return setStatus("error", { message: "파일 용량이 10MB를 초과합니다." });
      }

      try {
        const parsed = await parseExcelFile(file, password);

        if (parsed.rows.length === 0) {
          return setStatus("empty", { message: "헤더만 있고 데이터 행이 없습니다." });
        }

        const skippedSheetsMessage =
          parsed.skippedSheets.length > 0
            ? `제외된 시트: ${parsed.skippedSheets.join(", ")} (헤더가 다르거나 표 형태가 아님)`
            : undefined;

        if (!referenceHeadersRef.current) {
          referenceHeadersRef.current = parsed.headers;
          return setStatus(
            "ok",
            { rowCount: parsed.rows.length, message: skippedSheetsMessage },
            parsed
          );
        }

        const diff = diffHeaders(referenceHeadersRef.current, parsed.headers);
        if (headersMatch(diff)) {
          return setStatus(
            "ok",
            { rowCount: parsed.rows.length, message: skippedSheetsMessage },
            parsed
          );
        }
        return setStatus("mismatch", { message: describeHeaderDiff(diff) });
      } catch (err) {
        if (err instanceof EncryptedFileError) {
          return setStatus("locked", {
            message: "🔒 암호가 걸린 파일입니다. 아래에 암호를 입력해 주세요.",
          });
        }
        if (err instanceof WrongPasswordError) {
          return setStatus("locked", {
            message: "🔑 입력한 암호와 맞지 않습니다. 이 파일의 암호를 입력해 주세요.",
          });
        }
        if (err instanceof UnsupportedEncryptionError) {
          return setStatus("error", { message: err.message });
        }
        return setStatus("error", {
          message: err instanceof Error ? err.message : "파일을 읽을 수 없습니다.",
        });
      }
    },
    [updateEntry]
  );

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
        file,
        entry: {
          id: crypto.randomUUID(),
          fileName: file.name,
          status: "processing",
        },
      }));
      setItems((prev) => [...prev, ...pending]);

      // 순차 처리는 "가장 먼저 정상 파싱된 파일의 헤더를 기준으로 삼는" 규칙을 지키기 위함이다.
      for (let i = 0; i < accepted.length; i++) {
        const id = pending[i].entry.id;
        let status = await processFile(accepted[i], id);
        // 암호가 걸려 있으면 이미 통했던 암호들을 차례로 써 본다.
        for (const known of knownPasswordsRef.current) {
          if (status !== "locked") break;
          status = await processFile(accepted[i], id, known);
        }
      }
    },
    [items.length, processFile]
  );

  /** 입력받은 공통 암호로 잠긴 파일들을 한꺼번에 다시 읽는다. */
  const handleApplyPassword = useCallback(
    async (password: string) => {
      const targets = items.filter((it) => it.entry.status === "locked");
      if (targets.length === 0) return;

      setIsUnlocking(true);
      setUnlockingCount(targets.length);
      setPasswordNotice(null);
      let unlockedCount = 0;
      let failedCount = 0;
      try {
        for (const target of targets) {
          updateEntry(target.entry.id, {
            ...target,
            entry: { ...target.entry, status: "processing", message: undefined },
          });
          // 암호 키 계산이 CPU를 쓰므로, 화면이 "처리 중"을 그릴 틈을 준다.
          await new Promise((resolve) => setTimeout(resolve, 0));
          const status = await processFile(target.file, target.entry.id, password);
          if (status === "locked") failedCount++;
          else unlockedCount++;
        }
      } finally {
        setIsUnlocking(false);
        setUnlockingCount(0);
      }

      if (unlockedCount > 0 && !knownPasswordsRef.current.includes(password)) {
        knownPasswordsRef.current.push(password);
      }
      setPasswordNotice(
        failedCount > 0
          ? `🔑 ${failedCount}개 파일은 이 암호로 열리지 않았습니다. 그 파일들의 암호를 입력해 보세요.`
          : null
      );
    },
    [items, processFile, updateEntry]
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
    return sparseRemoved ? removeFirstColumnOnlyRows(merged) : merged;
  }, [merged, sparseRemoved]);

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
    setPasswordNotice(null);
    setSparseRemoved(false);
    referenceHeadersRef.current = null;
    knownPasswordsRef.current = [];
  }, []);

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.entry.id !== id);
      const stillHasOk = next.some((it) => it.entry.status === "ok");
      if (!stillHasOk) {
        referenceHeadersRef.current = null;
      }
      if (!next.some((it) => it.entry.status === "locked")) {
        setPasswordNotice(null);
      }
      return next;
    });
  }, []);

  const okCount = items.filter((it) => it.entry.status === "ok").length;
  const lockedCount = items.filter((it) => it.entry.status === "locked").length;
  const passwordPromptCount = isUnlocking ? unlockingCount : lockedCount;
  const problemCount = items.length - okCount;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Mascot size={76} className={styles.headerMascot} />
        <div>
          <h1 className={styles.heading}>엑셀 통합 정리 - by AI행정앱제작소</h1>
          <p className={styles.subheading}>
            📂 동일한 서식의 엑셀 파일 여러 개를 올리면 하나로 정리해 드립니다 ✨
          </p>
          <nav className={styles.headerLinks}>
            <Link href="/guide" className={styles.headerLink}>
              📖 사용법 보기
            </Link>
            {!IS_OFFLINE_BUILD && (
              <a href={OFFLINE_EXE_URL} className={styles.headerLink}>
                💾 오프라인용 실행파일(exe) 받기
              </a>
            )}
          </nav>
        </div>
      </header>

      <section className={styles.securityNote} aria-label="자료 보안 안내">
        <span className={styles.securityIcon} aria-hidden="true">
          🛡️
        </span>
        <div>
          <p className={styles.securityTitle}>🔒 자료 보안, 걱정하지 마세요!</p>
          <ul className={styles.securityPoints}>
            <li>🚫 서버로 전송하지 않아요 · 지금 쓰는 브라우저 안에서만 처리</li>
            <li>🗂️ 어디에도 저장하지 않아요</li>
            <li>🧹 창을 닫으면 내용이 모두 사라져요</li>
            <li>🔑 암호가 걸린 파일도 암호를 서버로 보내지 않고 브라우저에서 바로 열어요</li>
            {!IS_OFFLINE_BUILD && <li>💻 인터넷이 차단된 PC는 오프라인용 실행파일로 OK</li>}
          </ul>
        </div>
      </section>

      <main className={styles.main}>
        <section className={styles.leftColumn}>
          <FileUploader onFilesSelected={handleFilesSelected} />

          {warning && <p className={styles.warning}>{warning}</p>}

          {passwordPromptCount > 0 && (
            <PasswordPanel
              lockedCount={passwordPromptCount}
              isUnlocking={isUnlocking}
              notice={passwordNotice}
              onSubmit={handleApplyPassword}
            />
          )}


          {items.length > 0 && (
            <div className={styles.summaryRow}>
              <span>
                ✅ 정상 {okCount}개 · ⚠️ 확인 필요 {problemCount}개
              </span>
              <button type="button" className={styles.resetButton} onClick={handleReset}>
                🔄 초기화
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
                  <h2 className={styles.resultTitle}>👀 통합 결과 미리보기</h2>
                  <div className={styles.resultActions}>
                    {sparseRowCount > 0 && (
                      <button
                        type="button"
                        className={styles.renumberButton}
                        onClick={() => setSparseRemoved((r) => !r)}
                      >
                        {sparseRemoved
                          ? `↩️ 삭제한 행 복원 (${sparseRowCount}개)`
                          : `🧹 첫 칸만 있는 행 삭제 (${sparseRowCount}개)`}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.downloadButton}
                      onClick={handleDownload}
                      disabled={isDownloading}
                    >
                      {isDownloading ? "⏳ 생성 중..." : "⬇️ 엑셀 다운로드"}
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
                <Mascot size={120} src="/character/pose-jump.png" />
                <p className={styles.emptyStateText}>
                  ✨ 정상 인식된 파일이 쌓이면
                  <br />
                  이곳에 통합 결과 미리보기가 표시됩니다 👀
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
