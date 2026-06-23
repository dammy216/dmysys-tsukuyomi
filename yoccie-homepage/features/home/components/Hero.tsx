import { MusicControls } from "@/features/music";
import styles from "./Hero.module.css";

const DISCORD_INVITE = "https://discord.gg/EzyWgp6ur";

/** トップのヒーローエリア（見出し・参加ボタン・BGMコントロール） */
export function Hero() {
  return (
    <div className={styles.hero}>
      <h1 className="rainbow-text">月詠交流会へようこそ</h1>
      <p>
        月詠ではみんなが表現者！雑談やボイスチャット、コミュニティーで個性を出していこう！！
      </p>

      <a
        className={styles.joinButton}
        href={DISCORD_INVITE}
        target="_blank"
        rel="noopener noreferrer"
      >
        ツクヨミに参加
      </a>

      <p className={styles.hint}>下のボタンでrayがパートごとで流れるよ！</p>

      <MusicControls />
    </div>
  );
}
