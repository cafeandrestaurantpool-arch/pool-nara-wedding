#!/usr/bin/env python3
"""Google Drive の download_file_content が保存した JSON から、写真を取り出して保存する。

usage: python3 tools/drive_save.py <tool-resultのJSONファイル> <保存先フォルダ> <保存名(例 drive1.jpg)>
- 画像は長辺1600pxに縮小して JPEG で保存する
- 取り出した元ファイルの id とタイトルを src/drive_used.json に記録する（同じ写真を何度も使わないため）
"""
import base64, io, json, os, sys
from PIL import Image, ImageOps

src, outdir, name = sys.argv[1:4]
d = json.load(open(src, encoding="utf-8"))
im = ImageOps.exif_transpose(Image.open(io.BytesIO(base64.b64decode(d["content"])))).convert("RGB")
im.thumbnail((1600, 1600))
os.makedirs(outdir, exist_ok=True)
im.save(os.path.join(outdir, name), "JPEG", quality=84, optimize=True)
used_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "drive_used.json")
used = json.load(open(used_path, encoding="utf-8")) if os.path.exists(used_path) else {}
used[d["id"]] = d["title"]
json.dump(used, open(used_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved", os.path.join(outdir, name), im.size, "|", d["title"])
