import Link from "next/link";
import styles from "./SiteFooter.module.css";

const FEEDBACK_EMAIL = "admin@welflows.com";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.credits}>
        <span>🛠️ 제작 : AI행정앱제작소</span>
        <span className={styles.divider} aria-hidden="true">
          ·
        </span>
        <span>
          📮 사용장애 &amp; 피드백 :{" "}
          <a href={`mailto:${FEEDBACK_EMAIL}`} className={styles.email}>
            {FEEDBACK_EMAIL}
          </a>
        </span>
      </div>
      <Link href="/pyeongani" className={styles.characterLink}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/character/face-smile.png" alt="" className={styles.characterFace} />
        평안이 캐릭터 소개
      </Link>
    </footer>
  );
}
