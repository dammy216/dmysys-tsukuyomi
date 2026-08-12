const CREDITS = [
  {
    title: "Miyajima Torii",
    url: "https://sketchfab.com/3d-models/miyajima-torii-584bdf5ca606482289f1fc84f0c708cf",
    author: "RMSHR",
    authorUrl: "https://sketchfab.com/remy.sohier",
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
    <div
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        maxWidth: 320,
        padding: "6px 10px",
        borderRadius: 6,
        background: "rgba(0,0,0,0.45)",
        color: "rgba(255,255,255,0.75)",
        fontSize: 11,
        lineHeight: 1.5,
      }}
    >
      {CREDITS.map((c) => (
        <div key={c.url}>
          <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {c.title}
          </a>{" "}
          by{" "}
          <a href={c.authorUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {c.author}
          </a>{" "}
          (CC-BY-4.0)
        </div>
      ))}
    </div>
  );
}
