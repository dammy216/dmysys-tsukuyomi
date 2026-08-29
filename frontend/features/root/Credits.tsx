const CREDITS = [
  {
    title: "Miyajima Torii",
    url: "https://sketchfab.com/3d-models/miyajima-torii-584bdf5ca606482289f1fc84f0c708cf",
    author: "RMSHR",
    authorUrl: "https://sketchfab.com/remy.sohier",
    // 発光シェーダーを追加し、高さで色を橙→赤へ補間するよう改変している(MiyajimaTorii.tsx)。
    // CC-BY-4.0は改変した場合その旨を示すことを求めているため明記する。
    modified: true,
  },
  {
    title: "Old Japanese Lamp : Andon",
    url: "https://sketchfab.com/3d-models/old-japanese-lamp-andon-0f5cff9fb78b4657b26ddefff4e10fcf",
    author: "K",
    authorUrl: "https://sketchfab.com/tanaka.ko91",
  },
];

/** Sketchfab CC-BY-4.0モデルのクレジット表記（利用規約で表示が必須） */
export function Credits() {
  return (
    <div className="absolute right-2 bottom-2 max-w-80 rounded-md bg-black/45 px-2.5 py-1.5 text-[11px] leading-normal text-white/75">
      {CREDITS.map((c) => (
        <div key={c.url}>
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-inherit">
            {c.title}
          </a>{" "}
          by{" "}
          <a href={c.authorUrl} target="_blank" rel="noopener noreferrer" className="text-inherit">
            {c.author}
          </a>{" "}
          (CC-BY-4.0{c.modified ? ", modified" : ""})
        </div>
      ))}
    </div>
  );
}
