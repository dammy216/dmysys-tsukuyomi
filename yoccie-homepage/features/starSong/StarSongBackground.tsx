import styles from "./StarSongBackground.module.css";

/**
 * 「歌ってみた」ページ専用の背景。サイト共通の夜空とは切り離し、
 * ダークネイビー × ネオンシアン/ピンクの近未来 HUD 風の雰囲気にする。
 */
export function StarSongBackground() {
  return (
    <div className={styles.bg} aria-hidden>
      <div className={styles.grid} />
      <div className={styles.scanline} />
      <span className={styles.orb}>
        <span className={styles.orbRing} />
      </span>
      <span className={`${styles.blob} ${styles.blob1}`} />
      <span className={`${styles.blob} ${styles.blob2}`} />
      <span className={`${styles.blob} ${styles.blob3}`} />
      <span className={`${styles.sparkle} ${styles.sparkle1}`}>✦</span>
      <span className={`${styles.sparkle} ${styles.sparkle2}`}>✧</span>
      <span className={`${styles.sparkle} ${styles.sparkle3}`}>✦</span>
      <span className={`${styles.sparkle} ${styles.sparkle4}`}>✧</span>
    </div>
  );
}
