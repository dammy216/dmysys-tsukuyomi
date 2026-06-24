"""
watch_rive.py
rive/animations/ 配下の .lua ファイルを監視し、保存のたびに
MCP text_editor で Rive のスクリプトをリアルタイム更新する。

使い方:
  python rive/scripts/watch_rive.py

前提: Rive エディタが起動中で MCP サーバーが http://127.0.0.1:9791/mcp で動いていること。
"""

import os, sys, time, json, urllib.request

MCP_URL   = "http://127.0.0.1:9791/mcp"
LUA_DIR   = os.path.join(os.path.dirname(__file__), "..", "animations")
POLL_SEC  = 0.8   # 監視間隔(秒)

# ローカルパス → Rive スクリプト名のマッピング
SCRIPT_MAP = {
    "CharacterAnimation.lua": "CharacterAnimation",
}


def mcp_call(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1,
                          "method": method, "params": params}).encode()
    req = urllib.request.Request(
        MCP_URL, data=payload,
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode("utf-8")
    for line in body.splitlines():
        if line.startswith("data:"):
            return json.loads(line[5:].strip())
    return json.loads(body)


def rive_get_content(script_name):
    """Rive 上のスクリプト全行を文字列で返す。"""
    r = mcp_call("tools/call", {
        "name": "text_editor",
        "arguments": {"command": "view", "path": script_name}
    })
    items = r.get("result", {}).get("content", [])
    raw = items[0].get("text", "") if items else ""
    # "N: コード行\n" 形式から行内容だけ取り出す
    lines = []
    for line in raw.splitlines():
        idx = line.find(": ")
        if idx != -1 and line[:idx].isdigit():
            lines.append(line[idx + 2:])
        else:
            lines.append(line)
    return "\n".join(lines)


def rive_replace(script_name, old_content, new_content):
    """Rive スクリプトを old_content → new_content で置換する。"""
    r = mcp_call("tools/call", {
        "name": "text_editor",
        "arguments": {
            "command": "str_replace",
            "path": script_name,
            "old_string": old_content,
            "new_string": new_content,
        }
    })
    return r.get("result", {}).get("content", [{}])[0].get("text", "")


def sync(file_path, script_name):
    with open(file_path, encoding="utf-8") as f:
        new_content = f.read()
    old_content = rive_get_content(script_name)
    if old_content == new_content:
        return False
    result = rive_replace(script_name, old_content, new_content)
    print(f"  -> Rive 更新: {result[:80] if result else 'OK'}")
    return True


def main():
    print(f"[watch_rive] 監視開始: {LUA_DIR}")
    print(f"[watch_rive] Ctrl+C で終了\n")

    mtimes = {}
    for fname in SCRIPT_MAP:
        path = os.path.join(LUA_DIR, fname)
        if os.path.exists(path):
            mtimes[fname] = os.path.getmtime(path)
            print(f"  監視: {fname} -> Rive:{SCRIPT_MAP[fname]}")
        else:
            print(f"  [WARN] ファイルが見つかりません: {path}")

    print()
    try:
        while True:
            for fname, script_name in SCRIPT_MAP.items():
                path = os.path.join(LUA_DIR, fname)
                if not os.path.exists(path):
                    continue
                mtime = os.path.getmtime(path)
                if mtime != mtimes.get(fname):
                    mtimes[fname] = mtime
                    ts = time.strftime("%H:%M:%S")
                    print(f"[{ts}] 変更検出: {fname}", end=" ", flush=True)
                    try:
                        synced = sync(path, script_name)
                        if not synced:
                            print("(内容変化なし)")
                    except Exception as e:
                        print(f"[ERROR] {e}")
            time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("\n[watch_rive] 終了")


if __name__ == "__main__":
    main()
