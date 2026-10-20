import type { Metadata } from "next";
import Link from "next/link";
import styles from "./pyeongani.module.css";

export const metadata: Metadata = {
  title: "평안이 소개 - 엑셀 통합 정리 by AI행정앱제작소",
  description: "물결을 닮은 물방울 캐릭터 평안이를 소개합니다",
};

const FACES = [
  { src: "/character/face-smile.png", label: "미소" },
  { src: "/character/face-happy.png", label: "행복" },
  { src: "/character/face-calm.png", label: "평온" },
  { src: "/character/face-wow.png", label: "놀람" },
  { src: "/character/face-wink.png", label: "윙크" },
];

const COLORS = [
  { name: "하늘물 블루", hex: "#8fd3f2" },
  { name: "평온 민트", hex: "#9fdcd2" },
  { name: "따스한 아이보리", hex: "#fdf3e4" },
  { name: "연꽃 핑크", hex: "#f9b5b8" },
];

function CharacterImage({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  // 정적 내보내기(output: "export")라 next/image 최적화를 쓸 수 없어 일반 img를 쓴다.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

export default function PyeonganiPage() {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>
        🏠 엑셀 통합 정리로 돌아가기
      </Link>

      <header className={styles.hero}>
        <CharacterImage
          src="/character/hero.png"
          alt="손을 흔드는 물방울 캐릭터 평안이"
          className={styles.heroImage}
        />
        <div>
          <p className={styles.eyebrow}>💧 잔잔한 물결을 닮은 휴식 친구</p>
          <h1 className={styles.heading}>안녕하세요, 평안이예요!</h1>
          <p className={styles.lead}>
            양평에 사는 사람도, 잠시 지나가는 사람도 모두 평안하기를 바라며 태어났어요 💙
          </p>
        </div>
      </header>

      <section className={styles.story}>
        <h2 className={styles.sectionTitle}>🌱 평안이가 태어난 이야기</h2>
        <div className={styles.storyRow}>
          <CharacterImage src="/character/face-wow.png" className={styles.storyFace} />
          <p>
            양평군에는 원래 <strong>‘양춘이’</strong>라는 캐릭터가 있어요. 그런데 양춘이는
            ‘<strong>양</strong>평’의 ‘양’만 담고 있었죠. “그럼 ‘평’을 맡을 친구도 있으면
            좋겠다!” 🤔
          </p>
        </div>
        <div className={styles.storyRow}>
          <CharacterImage src="/character/face-happy.png" className={styles.storyFace} />
          <p>
            그래서 ‘양<strong>평</strong>’의 ‘평’에 해당하는 친구, <strong>‘평안이’</strong>를
            만들어 보았어요. 양춘이와 평안이가 나란히 서면 비로소 ‘양평’이 완성돼요 🤝
          </p>
        </div>
        <div className={styles.storyRow}>
          <CharacterImage src="/character/face-calm.png" className={styles.storyFace} />
          <p>
            이름에는 <strong>양평군에 살고 지나는 모든 사람과 존재가 평안하기를</strong> 바라는
            마음을 담았어요. 사람뿐 아니라 강물, 나무, 새와 바람까지 모두요 🌿🐦
          </p>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>🔍 이렇게 생겼어요</h2>
          <ul className={styles.featureList}>
            <li>💧 잔잔한 물결을 닮은 물방울 몸</li>
            <li>🌊 배에 흐르는 하얀 물결무늬</li>
            <li>🪷 머리 위에 살포시 핀 연꽃</li>
            <li>☺️ 언제나 느긋한 미소</li>
          </ul>
        </div>
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>🎨 평안이의 색</h2>
          <ul className={styles.colorList}>
            {COLORS.map((c) => (
              <li key={c.name}>
                <span className={styles.swatch} style={{ background: c.hex }} aria-hidden="true" />
                {c.name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>😊 평안이의 여러 표정</h2>
        <ul className={styles.faces}>
          {FACES.map((f) => (
            <li key={f.label} className={styles.face}>
              <CharacterImage src={f.src} alt={`평안이 ${f.label} 표정`} className={styles.faceImage} />
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.closing}>
        <CharacterImage src="/character/pose-heart.png" className={styles.closingImage} />
        <p className={styles.closingText}>오늘도, 마음이 평안한 양평 💙</p>
        <p className={styles.note}>
          평안이는 양평군의 공식 캐릭터가 아니라, 양평을 아끼는 마음으로 만든 비공식 창작
          캐릭터예요.
        </p>
      </section>
    </div>
  );
}
