import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Background } from "@/components/layout/Background";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CharacterFrame } from "@/features/character";
import { MusicProvider } from "@/features/music";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "月詠交流会 公式サイト",
  description:
    "「yoccie よっしー」が率いるツクヨミ交流会の公式サイト。雑談・ボイスチャット・ゲームで楽しく交流するコミュニティです。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} antialiased`}>
      <body>
        <MusicProvider>
          <Background />
          <SiteHeader />
          <CharacterFrame />
          {children}
        </MusicProvider>
      </body>
    </html>
  );
}
