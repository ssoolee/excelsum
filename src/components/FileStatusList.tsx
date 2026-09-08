import type { FileEntry } from "@/lib/types";
import styles from "./FileStatusList.module.css";

const STATUS_LABEL: Record<FileEntry["status"], string> = {
  processing: "처리 중",
  ok: "정상",
  mismatch: "서식 불일치",
  empty: "데이터 없음",
  error: "오류",
};

interface FileStatusListProps {
  entries: FileEntry[];
  onRemove: (id: string) => void;
}

export function FileStatusList({ entries, onRemove }: FileStatusListProps) {
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
        </li>
      ))}
    </ul>
  );
}
