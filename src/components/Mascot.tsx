import styles from "./Mascot.module.css";

interface MascotProps {
  size?: number;
  /** public/character/ 안의 포즈 이미지 경로. 기본은 손 흔드는 전신 포즈. */
  src?: string;
  className?: string;
  animated?: boolean;
}

/**
 * 마스코트 "평안이": 물결을 닮은 물방울 캐릭터. 사용자가 제공한 디자인 시트에서
 * 포즈별로 잘라 배경을 투명하게 만든 이미지(public/character/)를 쓴다.
 */
export function Mascot({
  size = 96,
  src = "/character/hero.png",
  className,
  animated = true,
}: MascotProps) {
  return (
    <div
      className={`${styles.wrapper} ${animated ? styles.animated : ""} ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {/* 정적 내보내기(output: "export")라 next/image 최적화를 쓸 수 없어 일반 img를 쓴다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="물방울 캐릭터 평안이" className={styles.image} />
    </div>
  );
}
