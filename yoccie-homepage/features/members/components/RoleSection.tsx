import type { ReactNode } from "react";
import styles from "./members.module.css";

/** 役職ごとの白背景カード枠 */
export function RoleSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.role}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
