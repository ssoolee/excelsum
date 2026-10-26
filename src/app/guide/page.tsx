import type { Metadata } from "next";
import Link from "next/link";
import { OFFLINE_EXE_URL, SHOW_OFFLINE_EXE_LINK } from "@/lib/links";
import styles from "./guide.module.css";

export const metadata: Metadata = {
  title: "사용법 - 엑셀 통합 정리 by AI행정앱제작소",
  description: "엑셀 통합 정리 서비스 사용법 안내",
};

// 캐릭터 이미지 "평안이"는 사용자가 제공한 디자인 시트에서 포즈별로 잘라 배경을 투명하게 만든 것이다.

const STEPS = [
  {
    title: "📂 같은 서식의 엑셀 파일을 준비해요",
    face: "/character/face-smile.png",
    body: "제목 줄(헤더)이 똑같은 .xlsx 또는 .xls 파일들을 모아 주세요. 한 번에 최대 50개, 파일 하나당 10MB까지 올릴 수 있어요.",
    tip: "💡 예전 엑셀로 만든 .xls와 요즘 .xlsx를 섞어 올려도, 제목 줄만 같으면 하나로 합쳐져요.",
  },
  {
    title: "📤 파일을 올려요",
    face: "/character/face-wink.png",
    body: "첫 화면 왼쪽 업로드 칸에 파일을 끌어다 놓거나, 버튼을 눌러 여러 개를 한꺼번에 고르세요.",
    tip: "💡 가장 먼저 정상으로 읽힌 파일의 제목 줄이 기준 서식이 돼요.",
  },
  {
    title: "🔍 파일별 상태를 확인해요",
    face: "/character/face-wow.png",
    body: "파일마다 ‘✅ 정상’, ‘🔒 암호 필요’, ‘⚠️ 서식 불일치’, ‘📭 데이터 없음’, ‘❌ 오류’ 중 하나가 표시돼요. ‘정상’인 파일만 하나로 합쳐져요.",
    tip: "💡 ‘서식 불일치’ 파일은 어떤 열이 다른지 알려드리니, 고친 뒤 다시 올리면 돼요.",
  },
  {
    title: "👀 통합 결과를 미리 봐요",
    face: "/character/face-calm.png",
    body: "오른쪽에 합쳐진 표가 나타나요. 맨 오른쪽 ‘출처 파일’ 열에서 각 행이 어느 파일에서 왔는지 확인할 수 있어요.",
    tip: "💡 연번만 있고 내용이 빈 행이 있으면 ‘첫 칸만 있는 행 삭제’ 버튼으로 정리할 수 있어요.",
  },
  {
    title: "⬇️ 엑셀로 내려받아요",
    face: "/character/face-happy.png",
    body: "‘엑셀 다운로드’를 누르면 ‘통합결과_날짜시각.xlsx’ 파일이 저장돼요. 다른 파일을 작업하려면 ‘초기화’를 누르세요.",
    tip: "💡 브라우저 창을 닫으면 올린 내용은 모두 사라지니 결과 파일을 꼭 저장해 두세요.",
  },
];

function Character({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  // 정적 내보내기(output: "export")라 next/image 최적화를 쓸 수 없어 일반 img를 쓴다.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

export default function GuidePage() {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>
        🏠 엑셀 통합 정리로 돌아가기
      </Link>

      <header className={styles.hero}>
        <Character
          src="/character/hero.png"
          alt="손을 흔드는 물방울 캐릭터 평안이"
          className={styles.heroCharacter}
        />
        <div className={styles.bubble}>
          <p className={styles.greeting}>👋 안녕하세요, 평안이예요!</p>
          <h1 className={styles.heading}>엑셀 통합 정리, 이렇게 써요! 📊</h1>
          <p className={styles.lead}>
            같은 서식의 엑셀 파일 여러 개를 올리면 하나의 파일로 합쳐 드려요.
            다섯 단계만 따라 해 보세요 🙌
          </p>
        </div>
      </header>

      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              {i + 1}
            </span>
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              <p className={styles.stepBody}>{step.body}</p>
              <p className={styles.tip}>
                <Character src={step.face} className={styles.tipCharacter} />
                <span>{step.tip}</span>
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <Character src="/character/pose-heart.png" className={styles.infoCharacter} />
          <h2 className={styles.infoTitle}>🔒 자료 보안은 이렇게 지켜져요</h2>
          <ul className={styles.infoList}>
            <li>🚫 올린 파일은 서버로 전송되지 않고, 쓰고 있는 브라우저 안에서만 처리돼요.</li>
            <li>🗂️ 파일 내용을 어디에도 저장하지 않아요. 창을 닫으면 모두 사라져요.</li>
            <li>🙅 회원가입이나 로그인이 필요 없어요.</li>
          </ul>
        </div>

        <div className={styles.infoCard}>
          <Character src="/character/face-wink.png" className={styles.infoCharacter} />
          <h2 className={styles.infoTitle}>🔒 암호가 걸린 파일도 괜찮아요</h2>
          <ul className={styles.infoList}>
            <li>
              암호가 걸린 파일을 올리면 ‘🔒 암호 필요’로 표시되고, 아래에 암호 입력칸이 나타나요.
            </li>
            <li>
              🔑 파일들의 암호가 같다면 <strong>한 번만 입력</strong>하면 전부 열려서 그대로 합쳐져요.
            </li>
            <li>
              🗂️ 파일마다 암호가 다르면 파일 목록의 각 칸에 있는 ‘이 파일만 열기’에 그 파일의 암호를
              넣으세요. 한 번 통한 암호는 나중에 올리는 파일에 자동으로 다시 써 봐요.
            </li>
            <li>🙈 입력한 암호도 서버로 보내지 않고 저장하지 않아요. 창을 닫으면 사라져요.</li>
            <li>
              🗄️ 예전 형식(.xls)에 걸린 암호도 똑같이 열려요. 아주 오래된 보호 방식(XOR)만 예외인데,
              그런 파일은 이유를 알려드려요.
            </li>
            <li>
              📄 시트 보호(수정 금지)만 걸린 파일은 암호를 넣지 않아도 바로 읽혀요. 파일을 열 때 암호를
              묻는 경우에만 입력칸이 나타나요.
            </li>
          </ul>
        </div>

        {SHOW_OFFLINE_EXE_LINK && (
          <div className={styles.infoCard}>
            <h2 className={styles.infoTitle}>💻 인터넷이 막힌 PC에서 쓰려면</h2>
            <p className={styles.infoText}>
              행정정보망처럼 외부 인터넷이 차단된 PC에서는 오프라인용 실행파일을 쓰세요.
              파일 하나만 USB나 내부 공유폴더로 옮겨 더블클릭하면 브라우저가 열리고
              바로 쓸 수 있어요. 검은 콘솔 창을 닫으면 종료돼요.
            </p>
            <a href={OFFLINE_EXE_URL} className={styles.downloadLink}>
              💾 오프라인용 실행파일(exe) 받기 · 약 95MB
            </a>
            <p className={styles.infoNote}>
              ⚠️ 서명되지 않은 파일이라 Windows가 경고하면 ‘추가 정보 → 실행’을 누르세요.
              기관 보안 정책으로 실행이 막혀 있다면 전산 담당 부서에 문의해 주세요.
            </p>
          </div>
        )}
      </section>

      <div className={styles.cta}>
        <Character src="/character/pose-jump.png" className={styles.ctaCharacter} />
        <Link href="/" className={styles.ctaButton}>
          🚀 지금 바로 시작하기
        </Link>
      </div>
    </div>
  );
}
