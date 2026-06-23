import { FadeIn } from "@/components/ui/FadeIn";
import styles from "./members.module.css";

/** 一般メンバーの名前グリッド */
export function MemberGrid({ members }: { members: string[] }) {
  return (
    <div className={styles.memberList}>
      {members.map((name) => (
        <FadeIn key={name} className={styles.member}>
          <span className={`${styles.name} ${styles.memName}`}>{name}</span>
        </FadeIn>
      ))}
    </div>
  );
}
