import { create } from "zustand";

/**
 * 編集モードのパネル間で共有する「今どれを編集しているか」。
 *
 * Theatre.js Studio と同じ3ペイン構成(左=Outline / 右=Details /
 * 下=Sequence Editor)で、この選択状態が3つのパネルをつなぐ:
 *   - Outline で選んだオブジェクトを Details が表示する
 *   - キーフレームを持つオブジェクト(Drone Path)なら Timeline が
 *     そのキーフレームを並べ、選んだキーを Details が編集する
 */

/** 編集できるオブジェクト。Outline の並び順そのもの */
export const EDITOR_OBJECTS = [
  {
    id: "drone-path",
    label: "Drone Path",
    /** 曲の再生位置にキーフレームを持つ(=タイムラインに並ぶ) */
    keyframed: true,
    hint: "11秒以降のドローン航路",
  },
  {
    id: "build-orbit",
    label: "Build Orbit",
    keyframed: false,
    hint: "0〜11秒の組み上げ周回",
  },
  {
    id: "camera-feel",
    label: "Camera Feel",
    keyframed: false,
    hint: "バンク・揺れ・追従",
  },
] as const;

export type EditorObjectId = (typeof EDITOR_OBJECTS)[number]["id"];

type EditorState = {
  selectedObject: EditorObjectId;
  /** Drone Path のキーフレーム番号(DRONE_PATH の添字) */
  selectedKeyIndex: number;
  selectObject: (id: EditorObjectId) => void;
  selectKeyIndex: (index: number) => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  selectedObject: "drone-path",
  selectedKeyIndex: 0,
  selectObject: (selectedObject) => set({ selectedObject }),
  selectKeyIndex: (selectedKeyIndex) => set({ selectedKeyIndex }),
}));
