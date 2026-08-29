import styles from "./Header.module.css";

/** サイト共通ヘッダー。DMYSYSのロゴ+ワードマークを表示する（下部ControlBarと同じ近未来HUDデザイン） */
export function Header() {
  return (
    <header className={styles.dock}>
      <div className={styles.bar}>
        <svg
          className={styles.logoMark}
          width="26"
          height="26"
          viewBox="0 0 26 26"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M13 1.5L23.5 7.5V18.5L13 24.5L2.5 18.5V7.5L13 1.5Z"
            stroke="url(#dmysysGradient)"
            strokeWidth="1.6"
          />
          <path
            d="M13 8L18 11V17L13 20L8 17V11L13 8Z"
            stroke="#5de3e6"
            strokeWidth="1.2"
            opacity="0.8"
          />
          <circle cx="13" cy="13" r="2" fill="#5de3e6" />
          <defs>
            <linearGradient id="dmysysGradient" x1="2.5" y1="1.5" x2="23.5" y2="24.5">
              <stop offset="0" stopColor="#5de3e6" />
              <stop offset="1" stopColor="#7c7ce6" />
            </linearGradient>
          </defs>
        </svg>
        <span className={styles.wordmark}>DMYSYS</span>
      </div>
    </header>
  );
}
