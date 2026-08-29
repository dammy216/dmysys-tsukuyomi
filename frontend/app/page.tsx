import type { Metadata } from "next";
import { RootScene } from "@/features/root";

export const metadata: Metadata = {
  title: "DMYSYS - ツクヨミ",
  description:
    "Three.js / React Three Fiber による3Dシーン。かぐや・ヤチヨの表示も切り替えられます。",
};

export default function Page() {
  return <RootScene />;
}
