"use client";

import {
  DRONE_PATH,
  keyframeIsDirty,
  keyframesAreDirty,
  replyKeyIsDirty,
  replyTimelineToCode,
  replyTrackIsDirty,
  replyTrackSpec,
  useDronePathStore,
  useReplyTimelineStore,
  type ReplyTrackId,
  type TimelineKey,
} from "@/features/reply";
import { EDITOR_OBJECTS, type EditorObjectId } from "./editorStore";

/**
 * 「キーフレームを持つオブジェクト」を Timeline / Details の2パネルから
 * 同じ形で扱うためのアダプタ。
 *
 * もともとタイムラインもDetailsも Drone Path 専用で、`useDronePathStore` と
 * `DRONE_FIELDS` を直に参照していた。天守・照明・灯籠・花火なども同じ
 * キーフレームで動かすようになり、扱う対象が増えたのでここで一枚かぶせる。
 *
 * 対象は2種類あって、実体のストアは別々:
 *   - Drone Path      … useDronePathStore(カメラ航路。1トラックだけ)
 *   - Reply の各要素  … useReplyTimelineStore(トラック id で引く)
 * どちらも「キーの配列 + チャンネルの仕様 + 値/時刻の編集 + 追加/削除 +
 * コード書き出し」という同じ操作を持つので、この型に寄せて2パネルからは
 * 区別せずに使えるようにする。
 */

/** タイムラインの行・Details の入力欄1つぶん */
export type KeyframeChannel = { key: string; label: string; step: number };

export type KeyframeTarget = {
  /** そのオブジェクトのキーフレーム(時刻の昇順) */
  keys: readonly TimelineKey<string>[];
  channels: readonly KeyframeChannel[];
  /** 成立に必要な最低キー数。これ以下では削除させない */
  minKeyCount: number;
  /** 「コードとしてコピー」の貼り付け先(パネルの案内文) */
  codePath: string;
  setField: (index: number, channel: string, value: number) => void;
  setTime: (index: number, t: number) => void;
  insertKeyframe: (t: number) => number;
  removeKeyframe: (index: number) => void;
  /** コードの既定値と1件でも食い違うか(「戻す」ボタンの有効/無効) */
  isDirty: boolean;
  /** そのキーが既定値と食い違うか(菱形の色分け) */
  keyIsDirty: (index: number) => boolean;
  /** 貼り付け先ファイルの中身を丸ごと生成する */
  toCode: () => string;
  reset: () => void;
};

/** Drone Path のチャンネル。Details の並びと揃える */
const DRONE_CHANNELS: readonly KeyframeChannel[] = [
  { key: "turn", label: "turn(回転数)", step: 0.01 },
  { key: "radius", label: "radius(半径)", step: 0.5 },
  { key: "y", label: "y(高さ)", step: 0.5 },
  { key: "lookY", label: "lookY(注視点)", step: 0.5 },
  { key: "fov", label: "fov(画角)", step: 1 },
];

/** Drone Path の「コードとしてコピー」。dronePathData.ts を丸ごと出す */
function droneToCode(keys: readonly TimelineKey<string>[]): string {
  const body = keys
    .map((k) => {
      const note = k.note ? `  // ${k.note}\n` : "";
      return `${note}  { t: ${k.t}, turn: ${k.turn}, radius: ${k.radius}, y: ${k.y}, lookY: ${k.lookY}, fov: ${k.fov} },`;
    })
    .join("\n");
  return (
    'import type { DroneKey } from "./dronePathType";\n\n' +
    `export const DRONE_PATH: readonly DroneKey[] = [\n${body}\n] as const;\n`
  );
}

/** そのオブジェクトがキーフレームを持つか(Outline の定義から引く) */
export function isKeyframed(id: EditorObjectId): boolean {
  return EDITOR_OBJECTS.find((o) => o.id === id)?.keyframed ?? false;
}

/**
 * 選択中のオブジェクトを KeyframeTarget として返す。キーフレームを持たない
 * オブジェクト(Camera Feel のような曲全体に効く定数)なら null。
 *
 * **フックなので呼び出しは無条件**。両方のストアを購読したうえで、選択に
 * 応じてどちらを返すか決めている(条件付きで購読するとフックの規則を破る)。
 */
export function useKeyframeTarget(id: EditorObjectId): KeyframeTarget | null {
  const droneKeys = useDronePathStore((s) => s.keyframes);
  const replyTracks = useReplyTimelineStore((s) => s.tracks);

  if (!isKeyframed(id)) return null;

  if (id === "drone-path") {
    const keys = droneKeys as unknown as readonly TimelineKey<string>[];
    const store = useDronePathStore.getState();
    return {
      keys,
      channels: DRONE_CHANNELS,
      // 航路として成立する最低数(始点・終点)
      minKeyCount: 2,
      codePath: "features/reply/dronePathData.ts",
      setField: (index, channel, value) =>
        // DroneKeyField は turn|radius|y|lookY|fov。仕様(DRONE_CHANNELS)から
        // しか呼ばないので、実在しないフィールドが来ることはない
        store.setField(index, channel as "turn", value),
      setTime: (index, t) => store.setTime(index, t),
      insertKeyframe: (t) => store.insertKeyframe(t),
      removeKeyframe: (index) => store.removeKeyframe(index),
      isDirty: keyframesAreDirty(droneKeys),
      keyIsDirty: (index) => keyframeIsDirty(droneKeys, index),
      toCode: () => droneToCode(keys),
      reset: () => useDronePathStore.getState().reset(),
    };
  }

  // 残りは Reply のタイムラインのトラック(Outline の id をそのまま使う)
  const trackId = id as ReplyTrackId;
  const spec = replyTrackSpec(trackId);
  const store = useReplyTimelineStore.getState();
  return {
    keys: replyTracks[trackId] as unknown as readonly TimelineKey<string>[],
    channels: spec.channels,
    minKeyCount: 2,
    codePath: "features/reply/replyTimelineData.ts",
    setField: (index, channel, value) =>
      store.setField(trackId, index, channel, value),
    setTime: (index, t) => store.setTime(trackId, index, t),
    insertKeyframe: (t) => store.insertKeyframe(trackId, t),
    removeKeyframe: (index) => store.removeKeyframe(trackId, index),
    isDirty: replyTrackIsDirty(replyTracks, trackId),
    keyIsDirty: (index) => replyKeyIsDirty(replyTracks, trackId, index),
    /*
      Reply のタイムラインは**全トラックが1ファイル**なので、選択中の
      トラックだけでなく replyTimelineData.ts の中身を丸ごと出す
      (貼り付け先を全選択→貼り付けで確定できるようにするため)。
    */
    toCode: () => replyTimelineToCode(replyTracks),
    reset: () => useReplyTimelineStore.getState().resetTrack(trackId),
  };
}

/** Drone Path の既定値。タイムラインの尺のフォールバックに使う */
export const DRONE_FALLBACK_DURATION = DRONE_PATH[DRONE_PATH.length - 1].t;
