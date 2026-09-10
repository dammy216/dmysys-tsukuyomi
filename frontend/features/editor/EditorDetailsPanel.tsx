"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  CAMERA_FEEL_DEFAULTS,
  CAMERA_FEEL_SPECS,
  sampleTimeline,
  useCameraFeelStore,
  type ParamSpec,
} from "@/features/reply";
import { EDITOR_OBJECTS, useEditorStore } from "./editorStore";
import { useKeyframeTarget, type KeyframeTarget } from "./keyframeTarget";
import { EditorNumberField } from "./EditorNumberField";

/**
 * 右パネル(Details)。Outline で選んだオブジェクトのパラメータを出す。
 *
 * ここでの変更はブラウザのメモリ上にしか残らない**下書き**で、リロードすると
 * コードの既定値に戻る。気に入った値ができたら「コードとしてコピー」で
 * 該当のコード片を書き出し、features/reply/ 側のソースへ貼って確定させる。
 * (Theatre.js を撤去した経緯から、GUI とコードの自動同期はあえてしない。
 *  コードが常に正で、GUI は試写と下書きのための道具という役割分担。)
 */

/*
  幅は使う側で足す(w-full を含めてしまうと、キーフレーム送りの小さいボタンで
  w-7 と衝突してどちらが勝つか不定になり、ボタンが横に潰れて見えていた)。
*/
const BUTTON =
  "rounded-sm border border-ed-line bg-ed-row px-2 py-1 text-[0.7rem] " +
  "text-ed-text transition-colors cursor-pointer hover:border-ed-accent/60 " +
  "hover:text-white disabled:cursor-not-allowed disabled:opacity-35 " +
  "disabled:hover:border-ed-line disabled:hover:text-ed-text";

/** クリップボードへ書き、少しの間ボタンの文言を差し替える */
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return { copied, copy };
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-ed-line px-2.5 py-2.5 last:border-b-0">
      <h3 className="text-[0.6rem] tracking-[0.16em] text-ed-dim">{title}</h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * キーフレームを持つオブジェクト(Drone Path / Reply の演出タイムライン)
 *
 * どちらも keyframeTarget.ts で同じ形(KeyframeTarget)に均してあるので、
 * ここではオブジェクトの種類を区別しない。
 * ------------------------------------------------------------------ */

/**
 * 再生位置での**補間後の値**をそのまま出す読み取り専用の欄。
 * 毎フレーム変わるので state ではなく DOM へ直接書く
 * (state にすると Details パネル全体が 60fps で再レンダーされる)。
 */
function LiveReadout({
  target,
  videoRef,
}: {
  target: KeyframeTarget;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const valueRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  /*
    rAF のループから読む用。target は毎レンダー作り直されるので、
    ループの依存に入れると毎レンダー貼り直しになる。ref に最新を写して
    ループ側はそれを読むだけにする(レンダー中に ref を書くと
    react-hooks/refs に弾かれるので、書き込みは effect でやる)。
  */
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    const sample: Record<string, number> = {};
    let raf = 0;
    const tick = () => {
      const raw = videoRef.current?.currentTime ?? 0;
      const t = Number.isFinite(raw) ? raw : 0;
      const current = targetRef.current;
      const channels = current.channels.map((c) => c.key);
      sampleTimeline(current.keys, channels, t, sample);
      if (timeRef.current) timeRef.current.textContent = `${t.toFixed(2)}s`;
      for (const channel of channels) {
        const node = valueRefs.current[channel];
        if (node) node.textContent = (sample[channel] ?? 0).toFixed(2);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[0.65rem] text-ed-dim">
        <span>再生位置</span>
        <span ref={timeRef} className="font-mono text-ed-accent tabular-nums">
          0.00s
        </span>
      </div>
      {target.channels.map(({ key, label }) => (
        <div
          key={key}
          className="flex items-center justify-between text-[0.68rem]"
        >
          <span className="text-ed-dim">{label}</span>
          <span
            ref={(node) => {
              valueRefs.current[key] = node;
            }}
            className="font-mono text-ed-text tabular-nums"
          >
            0.00
          </span>
        </div>
      ))}
    </div>
  );
}

function KeyframeDetails({
  target,
  videoRef,
}: {
  target: KeyframeTarget;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const selectedKeyIndex = useEditorStore((s) => s.selectedKeyIndex);
  const selectKeyIndex = useEditorStore((s) => s.selectKeyIndex);
  const { copied, copy } = useCopyToClipboard();

  const keyframes = target.keys;
  const index = Math.min(selectedKeyIndex, keyframes.length - 1);
  const key = keyframes[index];

  const dirty = target.isDirty;
  // 成立する最低数(始点・終点)は残す。タイムラインの右クリックで際限なく
  // 増やせる一方、消しすぎて破綻しないための下限。
  const canDelete = keyframes.length > target.minKeyCount;

  const handleCopy = () => copy(target.toCode());

  const handleDelete = () => {
    if (!canDelete) return;
    target.removeKeyframe(index);
    // 削除後の配列(長さ-1)に収まるよう選択位置を詰め直す
    selectKeyIndex(Math.min(index, keyframes.length - 2));
  };

  return (
    <>
      <PanelSection title={`KEYFRAME ${index + 1} / ${keyframes.length}`}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => selectKeyIndex(Math.max(index - 1, 0))}
            disabled={index <= 0}
            aria-label="前のキーフレーム"
            className={`${BUTTON} w-7`}
          >
            ‹
          </button>
          <span className="flex-1 text-center text-[0.65rem] text-ed-dim tabular-nums">
            {index + 1} / {keyframes.length}
          </span>
          <button
            type="button"
            onClick={() =>
              selectKeyIndex(Math.min(index + 1, keyframes.length - 1))
            }
            disabled={index >= keyframes.length - 1}
            aria-label="次のキーフレーム"
            className={`${BUTTON} w-7`}
          >
            ›
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            title={
              canDelete
                ? "このキーフレームを削除"
                : `最低${target.minKeyCount}点必要なため、これ以上は削除できない`
            }
            aria-label="このキーフレームを削除"
            className={`${BUTTON} w-7 hover:border-red-400/60 hover:text-red-300`}
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-[0.6rem] text-ed-dim">
          タイムラインを右クリックで追加、菱形を右クリックで削除
        </p>
        <div className="mt-1 flex flex-col gap-1.5">
          {/*
            t(時刻)だけ setTime を使う(setField とは違い、隣のキーを
            追い越さないよう前後のキーの間へクランプする)。タイムラインの
            ドラッグでしか動かせなかったのを、他のフィールドと同じく
            数値入力・ラベルドラッグでも編集できるようにしてある。
          */}
          <EditorNumberField
            label="t(時刻 秒)"
            value={key.t}
            step={0.1}
            onChange={(value) => target.setTime(index, value)}
          />
          {target.channels.map(({ key: channel, label, step }) => (
            <EditorNumberField
              key={channel}
              label={label}
              value={key[channel]}
              step={step}
              onChange={(value) => target.setField(index, channel, value)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="LIVE(補間後の現在値)">
        <LiveReadout target={target} videoRef={videoRef} />
      </PanelSection>

      <PanelSection title="COMMIT">
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={handleCopy} className={`${BUTTON} w-full`}>
            {copied ? "コピーした" : "コードとしてコピー"}
          </button>
          <button
            type="button"
            onClick={target.reset}
            disabled={!dirty}
            className={`${BUTTON} w-full`}
          >
            コードの値に戻す
          </button>
          <p className="text-[0.6rem] leading-relaxed text-ed-dim">
            貼り付け先: {target.codePath}(全選択→貼り付けでOK)
          </p>
        </div>
      </PanelSection>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * キーフレームを持たない数値パラメータのオブジェクト
 * ------------------------------------------------------------------ */

function ParamDetails<T extends Record<string, number>>({
  values,
  defaults,
  specs,
  codeName,
  codePath,
  fileImports,
  onChange,
  onReset,
}: {
  values: T;
  defaults: T;
  specs: ParamSpec<keyof T & string>[];
  /** 「コードとしてコピー」で出す定数名 */
  codeName: string;
  /** 貼り付け先の案内 */
  codePath: string;
  /**
   * 貼り付け先ファイルの先頭に要る import 文(末尾に空行込みで丸ごと)。
   * 無いファイル(camera-feel等)は省略でよい。
   */
  fileImports?: string;
  onChange: (key: keyof T & string, value: number) => void;
  onReset: () => void;
}) {
  const { copied, copy } = useCopyToClipboard();
  const dirty = specs.some(({ key }) => values[key] !== defaults[key]);

  const handleCopy = () => {
    /*
      comment(各値の意味の短い説明)は `/** {comment} *\/` として書き出す。
      全選択→貼り付けでファイルを丸ごと置き換えても、値の意味を説明する
      コメントだけは消えないようにするため。
    */
    const body = specs
      .map(({ key, defaultExpr, comment }) => {
        const unchanged = values[key] === defaults[key];
        const literal =
          unchanged && defaultExpr ? defaultExpr : String(values[key]);
        const doc = comment ? `  /** ${comment} */\n` : "";
        return `${doc}  ${key}: ${literal},`;
      })
      .join("\n");
    copy(`${fileImports ?? ""}export const ${codeName} = {\n${body}\n};\n`);
  };

  return (
    <>
      <PanelSection title="PARAMETERS">
        <div className="flex flex-col gap-1.5">
          {specs.map(({ key, label, step }) => (
            <EditorNumberField
              key={key}
              label={label}
              value={values[key]}
              step={step}
              onChange={(value) => onChange(key, value)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="COMMIT">
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={handleCopy} className={`${BUTTON} w-full`}>
            {copied ? "コピーした" : "コードとしてコピー"}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty}
            className={`${BUTTON} w-full`}
          >
            コードの値に戻す
          </button>
          <p className="text-[0.6rem] leading-relaxed text-ed-dim">
            貼り付け先: {codePath}(全選択→貼り付けでOK)
          </p>
        </div>
      </PanelSection>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function EditorDetailsPanel({
  replyVideoRef,
}: {
  replyVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  const selectedObject = useEditorStore((s) => s.selectedObject);
  const cameraFeel = useCameraFeelStore((s) => s.values);
  const target = useKeyframeTarget(selectedObject);
  const label =
    EDITOR_OBJECTS.find((o) => o.id === selectedObject)?.label ?? "";

  return (
    <div className="flex size-full flex-col overflow-hidden">
      {/* 高さは EditorLayout の TOP_HEIGHT(30)= VIEWPORT ヘッダーと揃える */}
      <div className="flex h-[30px] shrink-0 items-center justify-between border-b border-ed-line px-2.5">
        <span className="text-[0.65rem] tracking-[0.18em] text-ed-dim">
          DETAILS
        </span>
        <span className="text-[0.7rem] text-ed-accent">{label}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {target && (
          <KeyframeDetails target={target} videoRef={replyVideoRef} />
        )}
        {selectedObject === "camera-feel" && (
          <ParamDetails
            values={cameraFeel}
            defaults={CAMERA_FEEL_DEFAULTS}
            specs={CAMERA_FEEL_SPECS}
            codeName="CAMERA_FEEL_DEFAULTS"
            codePath="features/reply/cameraFeelDefaults.ts"
            onChange={(key, value) =>
              useCameraFeelStore.getState().setValue(key, value)
            }
            onReset={() => useCameraFeelStore.getState().reset()}
          />
        )}
      </div>
    </div>
  );
}
