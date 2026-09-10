import { create } from "zustand";
import { REPLY_TIMELINE } from "./replyTimelineData";
import {
  REPLY_TRACKS,
  replyTrackSpec,
  type ReplyTimelineKeys,
  type ReplyTrackId,
} from "./replyTimeline";
import { sampleTimeline, type TimelineKey } from "./timelineType";

/**
 * Reply の演出タイムラインの実行時コピー。REPLY_TIMELINE(replyTimelineData.ts)の
 * コピーから始まり、編集モードのパネルから書き換えられる。ページを開き直すと
 * コードの値に戻る(=永続化はしない下書き)。
 *
 * dronePathStore と同じ役割・同じ操作(値の変更 / 時刻の移動 / 追加 / 削除 /
 * まるごと差し替え / 既定値へ戻す)を、**トラック id 単位**で持つ。
 *
 * 型について: トラックごとにチャンネル名が違う(castle は build/assembly、
 * lights は level ...)ので、汎用の操作関数の中では
 * `TimelineKey<string>` として扱い、出し入れの境目だけキャストしている。
 * チャンネル名は replyTrackSpec() の仕様から引くので、実行時に存在しない
 * チャンネルを書くことはない。
 */

/** 汎用操作の中でだけ使う緩い形(上のコメント参照) */
type AnyKey = TimelineKey<string>;

/** 意味を持つために必要な最低キーフレーム数(始点・終点) */
const MIN_KEYFRAME_COUNT = 2;
/** 隣り合うキーの間隔として最低限空ける秒数 */
const MIN_KEY_GAP = 0.05;

function asAnyKeys(keys: ReplyTimelineKeys[ReplyTrackId]): AnyKey[] {
  return keys as unknown as AnyKey[];
}

function cloneTracks(source: ReplyTimelineKeys): ReplyTimelineKeys {
  const out = {} as ReplyTimelineKeys;
  for (const { id } of REPLY_TRACKS) {
    // 参照を共有すると編集が既定値そのものを汚すので、キーごと複製する
    (out[id] as unknown as AnyKey[]) = asAnyKeys(source[id]).map((k) => ({ ...k }));
  }
  return out;
}

function keysEqual(a: AnyKey, b: AnyKey | undefined) {
  if (!b) return false;
  if (a.t !== b.t) return false;
  for (const key of Object.keys(a)) {
    if (key === "note") continue;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * そのトラックが元の REPLY_TIMELINE と1件でも食い違うか。
 * 追加・削除で配列の**長さ**が変わっている場合は添字の対応関係が意味を
 * 持たないので、無条件に「元と違う」扱いにする。
 */
export function replyTrackIsDirty(
  tracks: ReplyTimelineKeys,
  id: ReplyTrackId,
): boolean {
  const current = asAnyKeys(tracks[id]);
  const original = asAnyKeys(REPLY_TIMELINE[id]);
  if (current.length !== original.length) return true;
  return current.some((k, i) => !keysEqual(k, original[i]));
}

/**
 * 個々のキーフレームが元の値と食い違うか(タイムラインの菱形の色分け用)。
 * 配列の長さ自体が違う場合は無条件に「食い違う」扱いにする。
 */
export function replyKeyIsDirty(
  tracks: ReplyTimelineKeys,
  id: ReplyTrackId,
  index: number,
): boolean {
  const current = asAnyKeys(tracks[id]);
  const original = asAnyKeys(REPLY_TIMELINE[id]);
  if (current.length !== original.length) return true;
  return !keysEqual(current[index], original[index]);
}

type ReplyTimelineState = {
  /** 実行時に演出が実際に辿るタイムライン */
  tracks: ReplyTimelineKeys;
  setField: (
    id: ReplyTrackId,
    index: number,
    channel: string,
    value: number,
  ) => void;
  /**
   * キーフレームの時刻を動かす(タイムラインのドラッグ用)。
   * sampleTimeline は配列が時刻順に並んでいる前提なので、隣のキーを
   * 追い越さないよう前後のキーの間へ必ずクランプする。
   */
  setTime: (id: ReplyTrackId, index: number, t: number) => void;
  /**
   * 時刻 t の位置に新しいキーフレームを挿入する(タイムラインの右クリック用)。
   * 挿入時点の**補間後の値**を初期値にするので、挿入した瞬間は演出が変わらない。
   * 戻り値は実際に挿入された配列上の添字。
   */
  insertKeyframe: (id: ReplyTrackId, t: number) => number;
  /** キーフレームを削除する。最低数(MIN_KEYFRAME_COUNT)は割らない */
  removeKeyframe: (id: ReplyTrackId, index: number) => void;
  /** Undo/Redo(editorHistory.ts)がスナップショットを復元するためのセッター */
  setTracks: (tracks: ReplyTimelineKeys) => void;
  /** 1トラックだけコードの値に戻す */
  resetTrack: (id: ReplyTrackId) => void;
};

export const useReplyTimelineStore = create<ReplyTimelineState>((set, get) => ({
  tracks: cloneTracks(REPLY_TIMELINE),

  setField: (id, index, channel, value) =>
    set((s) => {
      const next = asAnyKeys(s.tracks[id]).map((key, i) =>
        i === index ? { ...key, [channel]: value } : key,
      );
      return { tracks: { ...s.tracks, [id]: next } };
    }),

  setTime: (id, index, t) =>
    set((s) => {
      const keys = asAnyKeys(s.tracks[id]);
      const prev = keys[index - 1];
      const nextKey = keys[index + 1];
      const min = prev ? prev.t + MIN_KEY_GAP : 0;
      const max = nextKey ? nextKey.t - MIN_KEY_GAP : t;
      const clamped = Number(Math.min(Math.max(t, min), max).toFixed(2));
      const next = keys.map((key, i) =>
        i === index ? { ...key, t: clamped } : key,
      );
      return { tracks: { ...s.tracks, [id]: next } };
    }),

  insertKeyframe: (id, t) => {
    const keys = asAnyKeys(get().tracks[id]);
    let insertAt = keys.findIndex((k) => k.t > t);
    if (insertAt === -1) insertAt = keys.length;
    const prev = keys[insertAt - 1];
    const nextKey = keys[insertAt];
    const min = prev ? prev.t + MIN_KEY_GAP : 0;
    const max = nextKey ? nextKey.t - MIN_KEY_GAP : Number.POSITIVE_INFINITY;
    const clampedT = Number(
      Math.min(Math.max(t, min), Math.max(min, max)).toFixed(2),
    );

    // 挿入時点の補間後の値を初期値にする(挿入直後は演出が変わらない)
    const channels = replyTrackSpec(id).channels.map((c) => c.key);
    const sample: Record<string, number> = {};
    for (const channel of channels) sample[channel] = 0;
    sampleTimeline(keys, channels, clampedT, sample);

    const newKey = { t: clampedT, ...sample } as AnyKey;
    set((s) => {
      const current = asAnyKeys(s.tracks[id]);
      return {
        tracks: {
          ...s.tracks,
          [id]: [
            ...current.slice(0, insertAt),
            newKey,
            ...current.slice(insertAt),
          ],
        },
      };
    });
    return insertAt;
  },

  removeKeyframe: (id, index) =>
    set((s) => {
      const keys = asAnyKeys(s.tracks[id]);
      if (keys.length <= MIN_KEYFRAME_COUNT) return s;
      return {
        tracks: { ...s.tracks, [id]: keys.filter((_, i) => i !== index) },
      };
    }),

  setTracks: (tracks) => set({ tracks }),

  resetTrack: (id) =>
    set((s) => ({
      tracks: {
        ...s.tracks,
        [id]: asAnyKeys(REPLY_TIMELINE[id]).map((k) => ({ ...k })),
      },
    })),
}));

/** Undo/Redo のスナップショット用に、今のタイムラインを丸ごと複製する */
export function cloneReplyTimeline(tracks: ReplyTimelineKeys): ReplyTimelineKeys {
  return cloneTracks(tracks);
}
