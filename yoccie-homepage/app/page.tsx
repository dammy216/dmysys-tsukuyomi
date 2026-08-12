import type { Metadata } from "next";
import { StarSongPage } from "@/features/starSong";

export const metadata: Metadata = {
  title: "流れ星の正体 - 月詠交流会",
  description: "「流れ星の正体」に合わせてヤチヨが歌う特別ページです。",
};

export default function Page() {
  return <StarSongPage />;
}
