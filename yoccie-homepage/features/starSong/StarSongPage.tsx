import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { StarSongBackground } from "./StarSongBackground";
import { StarSongStage } from "./StarSongStage";
import { VIDEO_TITLE } from "./constants";
import styles from "./StarSongPage.module.css";

/** 「流れ星の正体」歌唱ページの組み立て（公式サイト風のパステルデザイン） */
export function StarSongPage() {
  return (
    <>
      <StarSongBackground />
      <PageContainer>
        <div className={styles.hero}>
          <span className={styles.badge}>SPECIAL MOVIE</span>
          <h1 className={styles.title}>{VIDEO_TITLE}</h1>
          <p className={styles.catch}>feat. 月見ヤチヨ</p>
        </div>

        <StarSongStage />

        <Footer />
      </PageContainer>
    </>
  );
}
