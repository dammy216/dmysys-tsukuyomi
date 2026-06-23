import Link from "next/link";
import styles from "./SiteHeader.module.css";

/** 全ページ共通の固定ヘッダーナビゲーション */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <nav className={styles.menu}>
        <ul>
          <li>
            <Link href="/">ホーム</Link>
          </li>
          <li>
            <Link href="/member">自己紹介</Link>
          </li>
          <li>
            <span className={`${styles.disabled}`} role="link" aria-disabled>
              Coming Soon
            </span>
          </li>
        </ul>
      </nav>
    </header>
  );
}
