"""新しく更新したページを、IndexNow で検索エンジン（Bing など）に知らせる。GitHub Actions が公開のあとに自動で実行する。

使い方: python3 tools/indexnow.py <公開フォルダ> <サイトのアドレス（最後は /）>
- 公開フォルダの sitemap.xml を読み、更新日（lastmod）が直近3日以内のページだけを送る（全ページを毎回送らない）。
- 鍵ファイル（<KEY>.txt）を公開フォルダに書き出す。鍵は公開してよいもの（IndexNow のしくみ）。
- 失敗しても公開は止めない（いつも終了コード0）。Google は IndexNow を使っていないので、Google には Search Console のサイトマップで知らせる。
"""
import datetime, json, os, re, sys, urllib.request

KEY = "f5583eafcedf018d704433ef65b0ce92"


def main():
    root, base = sys.argv[1], sys.argv[2].rstrip("/") + "/"
    open(os.path.join(root, KEY + ".txt"), "w").write(KEY)
    sm = open(os.path.join(root, "sitemap.xml"), encoding="utf-8").read()
    jst = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)
    since = (jst - datetime.timedelta(days=3)).date().isoformat()
    urls = []
    for m in re.finditer(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>", sm):
        loc, last = m.group(1).strip(), m.group(2).strip()[:10]
        if loc.startswith(base) and last >= since:
            urls.append(loc)
    urls = list(dict.fromkeys(urls))[:200] or [base]
    host = re.match(r"https?://([^/]+)", base).group(1)
    body = json.dumps({"host": host, "key": KEY, "keyLocation": base + KEY + ".txt", "urlList": urls}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"IndexNow: {r.status} ({len(urls)} URLs)")
    except Exception as e:  # 202 以外も、公開そのものには影響させない
        print(f"IndexNow: {getattr(e, 'code', '')} {e} ({len(urls)} URLs)")
    for u in urls:
        print("  ", u)


if __name__ == "__main__":
    main()
