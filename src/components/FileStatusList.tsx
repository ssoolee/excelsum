"use client";

import { useState } from "react";
import type { FileEntry } from "@/lib/types";
import styles from "./FileStatusList.module.css";

const STATUS_LABEL: Record<FileEntry["status"], string> = {
  processing: "⏳ 처리 중",
  ok: "✅ 정상",
  locked: "🔒 암호 필요",
  mismatch: "⚠️ 서식 불일치",
  empty: "📭 데이터 없음",
  error: "❌ 오류",
};

interface FileStatusListProps {
  entries: FileEntry[];
  onRemove: (id: string) => void;
  /** 파일 하나에만 암호를 적용한다(파일마다 암호가 다른 경우). */
  onUnlock?: (id: string, password: string) => void;
  /** 다른 파일을 여는 중이면 입력을 잠근다. */
  isUnlocking?: boolean;
}

export function FileStatusList({
  entries,
  onRemove,
  onUnlock,
  isUnlocking = false,
}: FileStatusListProps) {
  if (entries.length === 0) return null;

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.item}>
          <div className={styles.itemHeader}>
            <span className={styles.fileName}>{entry.fileName}</span>
            <div className={styles.itemActions}>
              <span className={`${styles.badge} ${styles[entry.status]}`}>
                {STATUS_LABEL[entry.status]}
              </span>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(entry.id)}
                aria-label={`${entry.fileName} 제거`}
              >
                ✕
              </button>
            </div>
          </div>
          {entry.message && <p className={styles.message}>{entry.message}</p>}
          {entry.status === "ok" && entry.rowCount !== undefined && (
            <p className={styles.rowCount}>{entry.rowCount.toLocaleString("ko-KR")}행 인식됨</p>
          )}
          {entry.status === "locked" && onUnlock && (
            <UnlockForm entry={entry} onUnlock={onUnlock} isUnlocking={isUnlocking} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** 파일마다 암호가 다를 때 쓰는 파일별 암호 입력칸. */
function UnlockForm({
  entry,
  onUnlock,
  isUnlocking,
}: {
  entry: FileEntry;
  onUnlock: (id: string, password: string) => void;
  isUnlocking: boolean;
}) {
  const [password, setPassword] = useState("");
  const inputId = `file-password-${entry.id}`;

  return (
    <form
      className={styles.unlockRow}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = password.trim();
        if (!trimmed || isUnlocking) return;
        onUnlock(entry.id, trimmed);
        setPassword("");
      }}
    >
      <label className={styles.unlockLabel} htmlFor={inputId}>
        이 파일만 열기
      </label>
      <input
        id={inputId}
        className={styles.unlockInput}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="이 파일의 암호"
        autoComplete="off"
        disabled={isUnlocking}
      />
      <button
        type="submit"
        className={styles.unlockButton}
        disabled={isUnlocking || password.trim().length === 0}
      >
        🔓 열기
      </button>
    </form>
  );
}
