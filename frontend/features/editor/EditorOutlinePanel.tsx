"use client";

import { EDITOR_OBJECTS, useEditorStore } from "./editorStore";

/**
 * 左パネル(Outline)。Theatre.js Studio の Outline と同じ役割で、
 * 編集できるオブジェクトを Project > Sheet > Object の階層で並べる。
 * 選んだものが右の Details と下の Timeline に反映される。
 */
export function EditorOutlinePanel() {
  const selectedObject = useEditorStore((s) => s.selectedObject);
  const selectObject = useEditorStore((s) => s.selectObject);

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-ed-line px-2.5 py-1.5 text-[0.65rem] tracking-[0.18em] text-ed-dim">
        OUTLINE
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        <div className="px-2.5 py-1 text-[0.72rem] text-ed-text">Scene</div>
        <div className="px-2.5 py-1 pl-5 text-[0.72rem] text-ed-dim">Reply</div>
        <ul>
          {EDITOR_OBJECTS.map((object) => {
            const active = object.id === selectedObject;
            return (
              <li key={object.id}>
                <button
                  type="button"
                  onClick={() => selectObject(object.id)}
                  aria-pressed={active}
                  title={object.hint}
                  className={
                    "flex w-full cursor-pointer flex-col items-start gap-0.5 py-1 pr-2.5 pl-8 text-left transition-colors " +
                    (active
                      ? "bg-ed-accent/15 text-ed-accent"
                      : "text-ed-text hover:bg-white/4")
                  }
                >
                  <span className="text-[0.72rem]">{object.label}</span>
                  <span
                    className={
                      "text-[0.6rem] " + (active ? "text-ed-accent/70" : "text-ed-dim")
                    }
                  >
                    {object.hint}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
