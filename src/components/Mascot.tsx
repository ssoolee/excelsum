import styles from "./Mascot.module.css";

interface MascotProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * 오리지널 마스코트: "양"과 "봄"을 모티프로 한 자체 제작 캐릭터.
 * 특정 지자체의 공식 캐릭터 디자인을 복제한 것이 아니라, 콘셉트(양 + 봄)에서만
 * 영감을 받아 새로 그린 것이다.
 */
export function Mascot({ size = 96, className, animated = true }: MascotProps) {
  return (
    <div
      className={`${styles.wrapper} ${animated ? styles.animated : ""} ${className ?? ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="봄을 모티프로 한 양 캐릭터 마스코트"
    >
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        {/* 뒷다리 */}
        <g stroke="#8a7358" strokeWidth="7" strokeLinecap="round">
          <line x1="72" y1="168" x2="70" y2="188" />
          <line x1="128" y1="168" x2="130" y2="188" />
          <line x1="90" y1="172" x2="88" y2="190" />
          <line x1="110" y1="172" x2="112" y2="190" />
        </g>

        {/* 뭉게뭉게 양털 몸통 */}
        <g fill="#fffaf0" stroke="#e9dcc3" strokeWidth="2">
          <circle cx="100" cy="128" r="52" />
          <circle cx="58" cy="112" r="28" />
          <circle cx="142" cy="112" r="28" />
          <circle cx="72" cy="82" r="26" />
          <circle cx="128" cy="82" r="26" />
          <circle cx="100" cy="72" r="28" />
          <circle cx="60" cy="140" r="22" />
          <circle cx="140" cy="140" r="22" />
        </g>

        {/* 귀 */}
        <g fill="#f3dcb4">
          <ellipse cx="66" cy="98" rx="9" ry="13" transform="rotate(-25 66 98)" />
          <ellipse cx="134" cy="98" rx="9" ry="13" transform="rotate(25 134 98)" />
        </g>

        {/* 얼굴 */}
        <ellipse cx="100" cy="112" rx="34" ry="30" fill="#f7e3bd" />

        {/* 볼 */}
        <circle cx="78" cy="122" r="7" fill="#ffb27a" opacity="0.55" />
        <circle cx="122" cy="122" r="7" fill="#ffb27a" opacity="0.55" />

        {/* 눈 (무표정한 점 눈) */}
        <circle cx="87" cy="108" r="4" fill="#3a2c1a" />
        <circle cx="113" cy="108" r="4" fill="#3a2c1a" />

        {/* 입 */}
        <path
          d="M92 126 Q100 132 108 126"
          fill="none"
          stroke="#8a5a3a"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* 봄을 상징하는 작은 꽃 */}
        <g transform="translate(150 62)">
          <circle cx="0" cy="-8" r="6" fill="#ff9a5a" />
          <circle cx="7" cy="-2" r="6" fill="#ff9a5a" />
          <circle cx="-7" cy="-2" r="6" fill="#ff9a5a" />
          <circle cx="0" cy="5" r="6" fill="#ff9a5a" />
          <circle cx="0" cy="-1" r="5" fill="#ffd27a" />
        </g>
      </svg>
    </div>
  );
}
