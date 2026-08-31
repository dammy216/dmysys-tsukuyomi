"use client";

import { PiCircleNotchBold } from "react-icons/pi";

/*
  「星降る海」を押してから、映像＋音のバッファが揃うまで被せる読み込み画面。
  この間は3Dシーンの演出も止めているので(useSceneStore の starfallPlaying)、
  揃った瞬間に演出・映像・音が一斉に始まる。

  常にマウントしたままにして opacity だけ切り替える(フェードで自然に消す)。
  z は Canvas と キャラパネル(z-10)より上、下部の ControlBar(z-20)より下。
  show=false のときは pointer-events を切って背面の操作を邪魔しない。
*/
export function StarfallLoadingOverlay({ show }: { show: boolean }) {
  return (
    <div
      aria-hidden={!show}
      role="status"
      className={
        "fixed inset-0 z-[15] flex flex-col items-center justify-center gap-4 " +
        "bg-[radial-gradient(circle_at_center,rgb(28_37_64/0.82),rgb(9_12_24/0.95))] " +
        "backdrop-blur-md transition-opacity duration-500 ease-out " +
        (show ? "opacity-100" : "pointer-events-none opacity-0")
      }
    >
      <PiCircleNotchBold
        size={40}
        className="animate-spin text-hud-pink motion-reduce:animate-none"
      />
      <p className="text-sm font-bold tracking-wide text-[#ffbedc]/90">
        星降る海を読み込んでいます…
      </p>
    </div>
  );
}
