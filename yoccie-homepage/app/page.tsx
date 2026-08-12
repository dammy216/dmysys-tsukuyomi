import type { Metadata } from "next";
import { Sandbox3D } from "@/features/sandbox";

export const metadata: Metadata = {
  title: "3D Sandbox - 月詠交流会",
  description: "Three.js / React Three Fiber の実験用サンドボックス。",
};

export default function Page() {
  return <Sandbox3D />;
}
