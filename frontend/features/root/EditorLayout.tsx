"use client";

import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { EditorAspectRatioMenu } from "./EditorAspectRatioMenu";
import { EditorFpsBadge } from "./EditorFpsBadge";
import { EditorToolbar } from "./EditorToolbar";
import { EditorViewport, type EditorViewportHandle } from "./EditorViewport";
import { useSceneStore } from "./store";

/**
 * 編集モード(useSceneStore.editorMode)の画面枠。Blender のように
 * 「3Dビューポート」と「パネル置き場」を重ねずに分ける。
 *
 * この余白(GUTTER)はもともと Theatre.js Studio のパネル(Outline/Details/
 * Sequence Editor)を左右・下に浮かせるためのドッキング領域として設計した
 * ものだが、Theatre.js自体は撤去済み(カメラのキーフレームは各featureの
 * コード配列を直接補間する方式に戻した)。このレイアウト自体(3Dビュー
 * ポートを中央へ縮めて再生コントロールに専念する編集モード)は引き続き
 * 有用なので、余白の区切りとラベルはそのまま残してある。
 *
 * 再生コントロール(EditorToolbar)は画面全体の下端ではなく、**3Dビューポート
 * の直下**(下余白の上)に置く。GUTTER で空けた領域の中に
 * 「ビューポート+ツールバー」をひとまとめにした箱を置き、
 * その箱自体を EditorViewport でユーザーがリサイズできるようにしてある
 * (ビューポート単体ではなく、ツールバーを含めた箱ごと縮尺を変える)。
 *
 * ここで使う色は Tailwind の @theme トークン(--color-hud 等)ではなく素の
 * 暗色にしてある。サイト本体のHUD(水色のネオン)とは別物の「編集用の道具」
 * であることを見た目で区別するため。
 *
 * 上の余白(GUTTER.top)の右端には「編集モード終了」ボタンと
 * EditorAspectRatioMenu(画面比率のテンプレ)を並べて置く。
 *
 * 編集モード終了ボタンは `L`キーと同じ useSceneStore.toggleEditorMode を呼ぶ。
 *
 * EditorAspectRatioMenu で選ぶと EditorViewport.applyAspectRatio
 * (ref経由)で、**ユーザーが今リサイズしている高さ**のまま幅だけを
 * その比率に合わせ直す。選択中はドロップダウンにそのプリセット名を
 * 表示し続け、ユーザーが手でリサイズしたら(EditorViewport の
 * onManualResize経由で)プレースホルダー表示に戻す。
 */

/**
 * 各パネル用に空ける余白(px)。元はTheatre.js Studioのパネル用の区画
 * (下のヘッダーコメント参照)。
 */
const GUTTER = {
  /** 上: グローバルツールバーのアイコン */
  top: 50,
  /** 左: Outline パネル */
  left: 200,
  /** 右: Details パネル */
  right: 300,
  /** 下: Sequence Editor */
  bottom: 180,
};

export function EditorLayout({
  replyVideoRef,
  children,
}: {
  /** Reply の映像。ツールバーの再生コントロールが操作する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
  /** 3Dキャンバス(RootCanvas) */
  children: ReactNode;
}) {
  const viewportRef = useRef<EditorViewportHandle | null>(null);
  /**
   * 現在有効なプリセット名(null=未適用/手動リサイズ後)。ドロップダウンの
   * 表示に使う(選ぶとそのラベルを、手でリサイズしたら null に戻して
   * プレースホルダー表示に戻す)。
   */
  const [activePreset, setActivePreset] = useState<string | null>(null);

  return (
    <div className="relative h-dvh w-full bg-[#0d1013]">
      {/* 上の余白(GUTTER.top)の右端に編集モード終了ボタンと画面比率のテンプレを置く。 */}
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
          onClick={() => useSceneStore.getState().toggleEditorMode()}
          className="rounded-md border border-white/12 bg-white/6 px-2 py-1 text-[0.75rem] text-white/70 cursor-pointer hover:border-white/25 hover:text-white"
        >
          編集モード終了
        </button>
      </div>

      {/*
        GUTTER(左右と下の余白)を除いた領域。この中に
        「ビューポート+ツールバー」の箱を中央寄せで置き、EditorViewport が
        その箱自体をリサイズできるようにする。
      */}
      <div
        className="absolute"
        style={{
          top: GUTTER.top,
          left: GUTTER.left,
          right: GUTTER.right,
          bottom: GUTTER.bottom,
        }}
      >
        <EditorViewport ref={viewportRef} onManualResize={() => setActivePreset(null)}>
          <div className="flex size-full flex-col overflow-hidden rounded-sm border border-white/10 bg-[#0b1626]">
            <div className="relative min-h-0 flex-1">
              {children}
              <EditorFpsBadge />
            </div>
            <EditorToolbar replyVideoRef={replyVideoRef} />
          </div>
        </EditorViewport>
      </div>

      {/*
        余白がどの区画かを示すだけのラベル(Theatre.js Studio用に区切って
        いた名残)。今は何も乗らないので常に表示されたままになる。
      */}
      <GutterLabel
        style={{ top: GUTTER.top, left: 0, bottom: GUTTER.bottom, width: GUTTER.left }}
      >
        Outline
      </GutterLabel>
      <GutterLabel
        style={{ top: GUTTER.top, right: 0, bottom: GUTTER.bottom, width: GUTTER.right }}
      >
        Details
      </GutterLabel>
      <GutterLabel style={{ left: 0, right: 0, bottom: 0, height: GUTTER.bottom }}>
        Sequence Editor
      </GutterLabel>
    </div>
  );
}

/** 余白の置き場所を示すだけのラベル */
function GutterLabel({
  style,
  children,
}: {
  style: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute flex items-center justify-center text-[0.7rem] tracking-widest text-white/12 select-none"
      style={style}
    >
      {children}
    </div>
  );
}
