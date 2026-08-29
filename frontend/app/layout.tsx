import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header } from "@/shared/layout";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "月詠交流会",
  description: "月詠交流会のサイト。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} antialiased`}>
      {/*
        ブラウザ拡張(ColorZilla 等)が <body> に cz-shortcut-listen などの
        属性を差し込むため、その1点だけ hydration 差分の警告を黙らせる。
        中身(children)の hydration チェックには影響しない。
      */}
      <body suppressHydrationWarning>
        <Header />
        {children}
      </body>
    </html>
  );
}
