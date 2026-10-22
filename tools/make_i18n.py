"""多言語トップページ生成（en / zh-Hant / ko / fr）。
日本語マスター(src/base/index.template.html)の文言を、tools/i18n/*.py の辞書(番号キー)で置き換える。
番号 = テンプレート内の本文テキスト(script/style除く)を出現順・重複除去で数えた通し番号。
"""
import html, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from i18n import en, zh, ko, fr  # noqa: E402

LANGS = [en, zh, ko, fr]
JA = dict(code="ja", hreflang="ja", label="日本語", path="/", name="日本語")
HREFLANG = {"ja": "ja", "en": "en", "zh-hant": "zh-Hant", "ko": "ko", "fr": "fr"}
NAMES = {"ja": "日本語", "en": "English", "zh-hant": "繁體中文", "ko": "한국어", "fr": "Français"}
PATHS = {"ja": "/", "en": "/en/", "zh-hant": "/zh-hant/", "ko": "/ko/", "fr": "/fr/"}

CSS = ("<style>.lgbar{display:flex;justify-content:flex-end;padding:8px clamp(20px,5vw,72px) 0;font-family:var(--fl,'Jost',sans-serif);font-size:.72rem;letter-spacing:.12em}"
       ".lgbar nav{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px 16px}.lgbar a{color:var(--muted,#6a6a66);text-decoration:none;padding:6px 0;border-bottom:1px solid transparent}"
       ".lgbar a:hover{color:var(--ink,#0a0a0a)}.lgbar a[aria-current]{color:var(--ink,#0a0a0a);border-bottom-color:currentColor}</style>")


def esc(s, quote=False):
    return html.escape(s, quote=quote)


def hreflang_block(site):
    links = [f'<link rel="alternate" hreflang="{HREFLANG[k]}" href="{site}{PATHS[k]}">' for k in PATHS]
    links.append(f'<link rel="alternate" hreflang="x-default" href="{site}/">')
    return "".join(links)


def switcher(cur, label="Language"):
    items = "".join(
        f'<a href="{PATHS[k]}" lang="{HREFLANG[k]}" hreflang="{HREFLANG[k]}"' + (' aria-current="page"' if k == cur else "") + f'>{NAMES[k]}</a>'
        for k in PATHS)
    return f'<div class="lgbar"><nav aria-label="{esc(label, True)}">{items}</nav></div>'


def _segments(t):
    """script/style を除いた部分と、それ以外に分ける"""
    parts, last = [], 0
    for m in re.finditer(r"<(script|style)\b[^>]*>.*?</\1>", t, flags=re.S):
        parts.append((False, t[last:m.start()]))
        parts.append((True, m.group(0)))
        last = m.end()
    parts.append((False, t[last:]))
    return parts


def text_index(t):
    tx = []
    for raw, seg in _segments(t):
        if raw:
            continue
        tx += [m.group(1) for m in re.finditer(r">([^<>]*\S[^<>]*)<", seg)]
    return list(dict.fromkeys(tx))


def attr_index(t):
    am = []
    for raw, seg in _segments(t):
        if raw:
            continue
        am += re.findall(r'\b(?:content|alt|aria-label)="([^"]*)"', seg)
    return list(dict.fromkeys(am))


def build_lang(t, mod, site, cards_html):
    L, T = mod.LANG, mod.T
    code = L["code"]
    url = site + L["path"]
    uniq = text_index(t)
    pos = {s: i for i, s in enumerate(uniq)}
    au = attr_index(t)
    apos = {s: i for i, s in enumerate(au)}
    aover = {1: L["desc"], 3: L["locale"], 4: L["ogtitle"], 5: L["ogdesc"], 13: L["ogalt"], 14: L["ogtitle"], 18: L["menu"], 19: L["banner"]}
    aover.update(L["alts"])
    out = []
    for raw, seg in _segments(t):
        if not raw:
            def tf(m):
                i = pos[m.group(1)]
                if i == 0:
                    return ">" + esc(L["title"]) + "<"
                return ">" + esc(T[i]) + "<" if i in T else m.group(0)
            seg = re.sub(r">([^<>]*\S[^<>]*)<", tf, seg)

            def af(m):
                i = apos[m.group(2)]
                return f'{m.group(1)}="{esc(aover[i], True)}"' if i in aover else m.group(0)
            seg = re.sub(r'\b(content|alt|aria-label)="([^"]*)"', af, seg)
        out.append(seg)
    t2 = "".join(out)

    # 言語・URL
    t2 = t2.replace('<html lang="ja">', f'<html lang="{L["html_lang"]}">', 1)
    t2 = t2.replace(f'<link rel="canonical" href="{site}/">', f'<link rel="canonical" href="{url}">' + hreflang_block(site), 1)
    t2 = t2.replace(f'<meta property="og:url" content="{site}/">', f'<meta property="og:url" content="{url}">', 1)

    # フォント(中国語・韓国語)
    if L.get("fonts"):
        t2 = t2.replace("&display=swap", "&family=" + L["fonts"] + "&display=swap", 1)
        t2 = t2.replace("</head>", f"<style>html:root:root:root{{--f:{L['fontfam']},'Zen Kaku Gothic New',sans-serif;--fd:'Jost',{L['fontfam']},sans-serif}}</style></head>", 1)

    # JSON-LD
    lds = []

    def ldf(m):
        d = json.loads(m.group(1))
        ty = d.get("@type")
        ld = L["ld"]
        if ty == "Restaurant":
            d.update(description=ld["desc"], keywords=ld["keywords"], areaServed=ld["area"], url=url, servesCuisine=ld["cuisine"], alternateName=ld["alt"])
            d["founder"]["jobTitle"] = ld["job"]
            d["address"].update(streetAddress="7 Funahashi-cho", addressLocality="Nara", addressRegion="Nara")
        elif ty == "FAQPage":
            d["mainEntity"] = [{"@type": "Question", "name": T[q], "acceptedAnswer": {"@type": "Answer", "text": T[q + 1]}} for q in range(203, 221, 2)]
        elif ty == "WebPage":
            d.update(name=L["ogtitle"], url=url, inLanguage=L["html_lang"])
            d["breadcrumb"]["itemListElement"][0].update(name=ld["home"], item=url)
        return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "</script>"
    t2 = re.sub(r'<script type="application/ld\+json">(.*?)</script>', ldf, t2, flags=re.S)

    # ブログ(日本語)への導線
    if cards_html:
        block = (f'<div class="dy" id="diary"><i class="lb">( WEDDING DIARY )</i><h3 class="dy-h">{esc(L["diary_h"])}</h3><div class="dy-g" lang="ja">'
                 + cards_html + f'</div><p class="dy-more"><a class="btn" href="/blog/">{esc(L["diary_btn"])}</a></p></div>')
        t2 = re.sub(r"<!--DIARY-START-->.*?<!--DIARY-END-->", lambda m: block, t2, flags=re.S)
        t2 = t2.replace("<!--NAV-BLOG-->", f'<a href="/blog/" lang="ja">{esc(L["diary"])}</a>')
    else:
        t2 = t2.replace("<!--NAV-BLOG-->", "")

    # 言語切替
    t2 = t2.replace("</head>", CSS + "</head>", 1)
    t2 = t2.replace("<body>", "<body>" + switcher(code, L["switch"]), 1) if "<body>" in t2 else t2
    return t2


def build_all(t_template, out_dir, site, cards_html):
    for mod in LANGS:
        d = os.path.join(out_dir, mod.LANG["code"])
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(build_lang(t_template, mod, site, cards_html))


def apply_to_ja(t, site):
    """日本語トップに hreflang と言語切替を追加"""
    t = t.replace(f'<link rel="canonical" href="{site}/">', f'<link rel="canonical" href="{site}/">' + hreflang_block(site), 1)
    t = t.replace("</head>", CSS + "</head>", 1)
    t = t.replace("<body>", "<body>" + switcher("ja", "言語"), 1)
    return t
