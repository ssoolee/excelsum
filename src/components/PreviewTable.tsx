import styles from "./PreviewTable.module.css";

interface PreviewTableProps {
  headers: string[];
  rows: unknown[][];
  totalRowCount: number;
  truncated: boolean;
}

export function PreviewTable({ headers, rows, totalRowCount, truncated }: PreviewTableProps) {
  if (headers.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.scrollArea}>
        <table className={styles.table}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {headers.map((_, ci) => (
                  <td key={ci}>{String(row[ci] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        총 {totalRowCount.toLocaleString("ko-KR")}행
        {truncated && " (미리보기는 처음 200행만 표시, 전체 내용은 다운로드 파일에서 확인 가능)"}
      </p>
    </div>
  );
}
