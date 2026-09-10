import { create } from "zustand";
import { REPLY_TRACKS, type ReplyTrackId } from "@/features/reply";

/**
 * 編集モードのパネル間で共有する「今どれを編集しているか」。
 *
 * Theatre.js Studio と同じ3ペイン構成(左=Outline / 右=Details /
 * 下=Sequence Editor)で、この選択状態が3つのパネルをつなぐ:
 *   - Outline で選んだオブジェクトを Details が表示する
 *   - キーフレームを持つオブジェクトなら Timeline がそのキーフレームを並べ、
 *     選んだキーを Details が編集する
 */

/**
 * 編集できるオブジェクトの id。
 * Reply の演出タイムラインのトラック id(features/reply/replyTimeline.ts の
 * REPLY_TRACKS)をそのまま取り込んでいるので、トラックを増やせば Outline にも
 * 自動で並ぶ。
 */
export type EditorObjectId = "drone-path" | "camera-feel" | ReplyTrackId;

type EditorObject = {
  id: EditorObjectId;
  label: string;
  /** 曲の再生位置にキーフレームを持つ(=タイムラインに並ぶ) */
  keyframed: boolean;
  hint: string;
};

/** 編集できるオブジェクト。Outline の並び順そのもの */
export const EDITOR_OBJECTS: readonly EditorObject[] = [
  {
    id: "drone-path",
    label: "Drone Path",
    keyframed: true,
    hint: "曲の頭から最後まで1本の航路(0〜11秒の組み上げ周回も含む)",
  },
  /*
    Reply の演出タイムライン(天守の組み上げ・照明・ステージ・灯籠・花火など)。
    以前は SceneContents の useFrame に命令的な計算として埋まっていて GUI から
    触れなかったものを、ドローン航路と同じキーフレームに寄せてある。
  */
  ...REPLY_TRACKS.map(
    (track): EditorObject => ({
      id: track.id,
      label: track.label,
      keyframed: true,
      hint: track.hint,
    }),
  ),
  {
    id: "camera-feel",
    label: "Camera Feel",
    keyframed: false,
    hint: "バンク・揺れ・追従",
  },
];

type EditorState = {
  selectedObject: EditorObjectId;
  /** 選択中のオブジェクトのキーフレーム番号(そのトラックの配列の添字) */
  selectedKeyIndex: number;
  selectObject: (id: EditorObjectId) => void;
  selectKeyIndex: (index: number) => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  selectedObject: "drone-path",
  selectedKeyIndex: 0,
  /*
    オブジェクトを切り替えたらキーの選択も先頭へ戻す。トラックごとにキーの
    本数が違うので、前のトラックの添字をそのまま持ち越すと存在しないキーを
    指してしまう(Details が範囲外を読む)。
  */
  selectObject: (selectedObject) => set({ selectedObject, selectedKeyIndex: 0 }),
  selectKeyIndex: (selectedKeyIndex) => set({ selectedKeyIndex }),
}));
