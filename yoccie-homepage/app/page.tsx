import type { Metadata } from "next";
import { SandboxScene } from "@/features/sandbox";

export const metadata: Metadata = {
  title: "DMYSYS - ツクヨミ",
  description:
    "Three.js / React Three Fiber の実験用サンドボックス。かぐや・ヤチヨの表示も切り替えられます。",
};

export default function Page() {
  return <SandboxScene />;
}
