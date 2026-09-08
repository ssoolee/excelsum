"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./FileUploader.module.css";

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function FileUploader({ onFilesSelected, disabled }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      onFilesSelected(Array.from(fileList));
    },
    [onFilesSelected]
  );

  return (
    <div
      className={`${styles.dropzone} ${isDragOver ? styles.dragOver : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
    >
      <p className={styles.title}>엑셀 파일 업로드</p>
      <p className={styles.hint}>
        동일한 서식의 .xlsx 파일 여러 개를 이곳에 끌어다 놓으세요
      </p>
      <button
        type="button"
        className={styles.selectButton}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        파일 선택
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
