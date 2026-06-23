import type { ReactNode } from "react";
import styles from "./PageContainer.module.css";

/** ヘッダー分の余白を確保した中央寄せのコンテンツ枠 */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className={styles.container}>{children}</div>;
}
