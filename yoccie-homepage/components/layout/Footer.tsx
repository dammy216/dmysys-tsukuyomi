import styles from "./Footer.module.css";

type FooterProps = {
  /** 更新日・バージョンなどの補足情報（ホームのみ表示） */
  meta?: { lastUpdated: string; version: string };
};

/** 全ページ共通フッター */
export function Footer({ meta }: FooterProps) {
  return (
    <footer className={styles.footer}>
      <p>© 月詠交流会 作成者：ひーくん・抹茶ラテ</p>
      {meta && (
        <div className={styles.meta}>
          <span>最終更新日: {meta.lastUpdated}</span> │{" "}
          <span>Version {meta.version}</span>
        </div>
      )}
    </footer>
  );
}
