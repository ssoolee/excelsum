"use client";

import { useState } from "react";
import styles from "./PasswordPanel.module.css";

interface PasswordPanelProps {
  /** 암호가 필요한 파일 개수 */
  lockedCount: number;
  /** 암호를 적용해 다시 읽는 중인지 */
  isUnlocking: boolean;
  /** 직전 시도 결과 안내문(암호 불일치 등) */
  notice?: string | null;
  onSubmit: (password: string) => void;
}

export function PasswordPanel({
  lockedCount,
  isUnlocking,
  notice,
  onSubmit,
}: PasswordPanelProps) {
  // 잠긴 파일이 모두 풀리면 부모가 이 패널을 떼어내므로, 입력한 암호도 함께 사라진다.
  const [password, setPassword] = useState("");

  return (
    <form
      className={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = password.trim();
        if (!trimmed || isUnlocking) return;
        onSubmit(trimmed);
        // 다음 시도 때 앞 암호 뒤에 덧붙지 않도록 입력란을 비운다.
        setPassword("");
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        🔒
      </span>
      <div className={styles.body}>
        <label className={styles.title} htmlFor="common-password">
          암호가 걸린 파일 {lockedCount}개 · 암호를 입력해 주세요
        </label>
        <div className={styles.inputRow}>
          <input
            id="common-password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="엑셀 파일 암호"
            autoComplete="off"
            disabled={isUnlocking}
          />
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isUnlocking || password.trim().length === 0}
          >
            {isUnlocking ? "⏳ 여는 중..." : "🔓 암호 적용"}
          </button>
        </div>
        <p className={styles.hint}>
          🔑 파일들의 암호가 같다면 한 번만 입력하면 전부 열립니다 · 암호는 어디에도 저장되지 않고 이
          브라우저 안에서만 쓰입니다
        </p>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
      </div>
    </form>
  );
}
