import type { Metadata } from "next";
import { MembersPage } from "@/features/members";

export const metadata: Metadata = {
  title: "メンバー紹介 - 月詠交流会",
  description: "月詠交流会の鯖主・副官・モデレーター・メンバーの紹介ページです。",
};

export default function Page() {
  return <MembersPage />;
}
