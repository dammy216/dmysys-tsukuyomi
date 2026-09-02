const CREDITS = [
  {
    title: "Miyajima Torii",
    url: "https://sketchfab.com/3d-models/miyajima-torii-584bdf5ca606482289f1fc84f0c708cf",
    author: "RMSHR",
    authorUrl: "https://sketchfab.com/remy.sohier",
    license: "CC-BY-4.0",
    // 発光シェーダーを追加し、高さで色を橙→赤へ補間するよう改変している(MiyajimaTorii.tsx)。
    // CC-BY-4.0は改変した場合その旨を示すことを求めているため明記する。
    modified: true,
  },
  {
    // Reply モードの土台。ライセンスはCC-BYではなくSketchfab Standardなので分けて表記する
    title: "【3DScan】江戸城 寛永度天守閣",
    url: "https://sketchfab.com/3d-models/3dscan-edo-castle-944e48f240cc449abb5ecc969051b155",
    author: "BENA-3DSolution",
    authorUrl: "https://sketchfab.com/BENA-ArchitecturalModeling",
    license: "Sketchfab Standard",
    // baseColor を emissiveMap に流用した自己発光マテリアルへ差し替えている(EdoCastle.tsx)
    modified: true,
  },
];

/** Sketchfabモデルのクレジット表記（利用規約で表示が必須） */
export function Credits() {
  return (
    <div
      className="absolute right-2 bottom-2 max-w-80 rounded-md bg-black/45 px-2.5 py-1.5 text-[11px] leading-normal text-white/75
        max-sm:inset-x-0 max-sm:bottom-auto max-sm:top-[calc(env(safe-area-inset-top)+0.35rem)] max-sm:mx-auto max-sm:w-max max-sm:max-w-[92vw]
        max-sm:px-2 max-sm:py-1 max-sm:text-center max-sm:text-[9px] max-sm:leading-snug"
    >
      {CREDITS.map((c) => (
        <div key={c.url}>
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-inherit">
            {c.title}
          </a>{" "}
          by{" "}
          <a href={c.authorUrl} target="_blank" rel="noopener noreferrer" className="text-inherit">
            {c.author}
          </a>{" "}
          ({c.license}
          {c.modified ? ", modified" : ""})
        </div>
      ))}
    </div>
  );
}
