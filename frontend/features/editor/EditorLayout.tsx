"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useSceneStore } from "@/features/root/store";
import { EditorAspectRatioMenu } from "./EditorAspectRatioMenu";
import { EditorDetailsPanel } from "./EditorDetailsPanel";
import { EditorFpsBadge } from "./EditorFpsBadge";
import { EditorOutlinePanel } from "./EditorOutlinePanel";
import { EditorTimeline } from "./EditorTimeline";
import { EditorToolbar } from "./EditorToolbar";
import { EditorViewport, type EditorViewportHandle } from "./EditorViewport";

/**
 * 編集モード(useSceneStore.editorMode)の画面枠。Theatre.js Studio と同じ
 * 3ペイン構成にしてある:
 *   - 左(GUTTER.left)   = Outline。編集できるオブジェクトの一覧
 *   - 右(GUTTER.right)  = Details。選んだオブジェクトのパラメータ(リアルタイム)
 *   - 下(GUTTER.bottom) = Sequence Editor。キーフレームと再生ヘッド
 * 中央が3Dビューポートで、その直下に再生コントロール(EditorToolbar)を置く。
 * 色は app/globals.css の --color-ed-* トークン(ダークグレー＋ティール)。
 *
 * **children(3Dキャンバス)は active に関わらず常に同じ位置で描画する。**
 * 以前は RootScene 側が「編集モードなら EditorLayout で包む / 通常なら
 * 直に置く」と出し分けていたため、`L` を押すたびに React が <Canvas> を
 * アンマウント→再マウントし、WebGLコンテキストとモデルの読み込みごと
 * 作り直していた(演出中に編集モードへ入ると画が固まって最初からやり直しに
 * 見える不具合の原因)。ここでは枠の側だけを active で切り替え、
 * 非表示のときは display:contents で「枠が無いのと同じ」レイアウトにする。
 */

/** 各パネル用に空ける余白(px) */
const GUTTER = {
  /** 上: 画面比率メニューと編集モード終了ボタン */
  top: 40,
  /** 左: Outline */
  left: 190,
  /** 右: Details */
  right: 260,
  /** 下: Sequence Editor(見出し + 目盛り + プロパティ5行 が収まる高さ) */
  bottom: 205,
};

/** パネルの共通の見た目 */
const PANEL = "absolute overflow-hidden bg-ed-panel text-ed-text";

export function EditorLayout({
  active,
  replyVideoRef,
  children,
}: {
  /** 編集モードかどうか。false のときは枠を出さず children だけを通す */
  active: boolean;
  /** Reply の映像。ツールバーとタイムラインが操作/参照する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
  /** 3Dキャンバス(RootCanvas) */
  children: ReactNode;
}) {
  const toggleEditorMode = useSceneStore((s) => s.toggleEditorMode);
  const viewportRef = useRef<EditorViewportHandle | null>(null);
  /**
   * 現在有効なプリセット名(null=未適用/手動リサイズ後)。ドロップダウンの
   * 表示に使う(選ぶとそのラベルを、手でリサイズしたら null に戻して
   * プレースホルダー表示に戻す)。
   */
  const [activePreset, setActivePreset] = useState<string | null>(null);

  return (
    <div className={active ? "relative h-dvh w-full bg-ed-bg" : "contents"}>
      {active && (
        <div
          className="absolute flex items-center justify-end gap-2"
          style={{ top: 0, height: GUTTER.top, left: GUTTER.left, right: GUTTER.right }}
        >
          <EditorAspectRatioMenu
            viewportRef={viewportRef}
            value={activePreset}
            onSelect={setActivePreset}
          />
          <button
            type="button"
            onClick={toggleEditorMode}
            className="cursor-pointer rounded-sm border border-ed-line bg-ed-row px-2 py-1 text-[0.7rem] text-ed-text hover:border-ed-accent/60 hover:text-white"
          >
            編集モード終了
          </button>
        </div>
      )}

      {/*
        中央のビューポート。active でないときは display:contents にして
        「この入れ物は無い」のと同じ扱いにする(= 3Dキャンバスは今まで通り
        画面いっぱい)。children の位置は変えないので再マウントされない。
      */}
      <div
        className={active ? "absolute" : "contents"}
        style={
          active
            ? {
                top: GUTTER.top,
                left: GUTTER.left,
                right: GUTTER.right,
                bottom: GUTTER.bottom,
              }
            : undefined
        }
      >
        <EditorViewport
          ref={viewportRef}
          active={active}
          onManualResize={() => setActivePreset(null)}
        >
          <div
            className={
              active
                ? "flex size-full flex-col overflow-hidden rounded-sm border border-ed-line bg-[#0b1626]"
                : "contents"
            }
          >
            <div className={active ? "relative min-h-0 flex-1" : "contents"}>
              {children}
              {active && <EditorFpsBadge />}
            </div>
            {active && <EditorToolbar replyVideoRef={replyVideoRef} />}
          </div>
        </EditorViewport>
      </div>

      {active && (
        <>
          <div
            className={`${PANEL} border-r border-ed-line`}
            style={{ top: 0, left: 0, bottom: GUTTER.bottom, width: GUTTER.left }}
          >
            <EditorOutlinePanel />
          </div>
          <div
            className={`${PANEL} border-l border-ed-line`}
            style={{ top: 0, right: 0, bottom: GUTTER.bottom, width: GUTTER.right }}
          >
            <EditorDetailsPanel replyVideoRef={replyVideoRef} />
          </div>
          <div
            className={`${PANEL} border-t border-ed-line`}
            style={{ left: 0, right: 0, bottom: 0, height: GUTTER.bottom }}
          >
            <EditorTimeline replyVideoRef={replyVideoRef} />
          </div>
        </>
      )}
    </div>
  );
}
