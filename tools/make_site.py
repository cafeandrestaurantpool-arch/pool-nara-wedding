#!/usr/bin/env python3
"""POOL wedding site + blog generator.

usage: python3 make_site.py --src pool-site-src --out pool-site
  src/base/index.template.html  (top page with DIARY markers)
  src/base/ogp.jpg, robots.txt
  src/posts/<slug>/post.md      (+ photos in the same folder)

post.md format:
  title: 記事のタイトル
  date: 2026-10-22
  photo: cover.jpg            (一覧と記事の先頭に出す写真。省略可)
  ---
  本文。空行で段落が分かれます。
  ## 小見出し
  ![写真の説明](photo2.jpg)
  - 箇条書き
"""
import argparse, datetime as dt, html, json, os, re, shutil, sys
from PIL import Image, ImageOps
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_i18n as i18n

SITE = "https://pool-nara-wedding.netlify.app"
NAME = "CAFE & RESTAURANT POOL"
TEL = "+815054877047"
RESERVE = "https://r.gnavi.co.jp/plan/ery83tn00000/plan-reserve/plan/plan_list/#wrapper"
KEYWORDS = "奈良,ウエディング,二次会,2次会,結婚式,貸切,ブログ"
LATEST_ON_TOP = 6

e = html.escape


def parse_post(path, slug):
    raw = open(path, encoding="utf-8").read().replace("\r\n", "\n")
    head, _, body = raw.partition("\n---\n")
    meta = {}
    for line in head.split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip().lower()] = v.strip()
    if not meta.get("title"):
        sys.exit(f"[{slug}] title がありません")
    date = meta.get("date") or slug[:10]
    try:
        d = dt.date.fromisoformat(date)
    except ValueError:
        sys.exit(f"[{slug}] date の形式は 2026-10-22 のように書いてください")
    return meta, body.strip(), d


SRC_ROOT = "."


def resolve_img(sd, fn):
    """post folder first, then src/photos (photos/photo08.jpg or photo08.jpg)."""
    for c in (os.path.join(sd, fn), os.path.join(SRC_ROOT, fn), os.path.join(SRC_ROOT, "photos", fn), os.path.join(SRC_ROOT, "photos", os.path.basename(fn))):
        if os.path.isfile(c):
            return c
    sys.exit(f"写真が見つかりません: {fn}")


def prep_image(src, dst, maxw):
    im = Image.open(src)
    im = ImageOps.exif_transpose(im).convert("RGB")
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    return im.size


def md_body(body, slug, outdir, srcdir):
    """very small markdown -> html; copies/shrinks referenced images."""
    out, para, lst = [], [], []

    def flush():
        nonlocal para, lst
        if para:
            out.append("<p>" + "<br>".join(e(x) for x in para) + "</p>")
            para = []
        if lst:
            out.append("<ul>" + "".join(f"<li>{e(x)}</li>" for x in lst) + "</ul>")
            lst = []

    for line in body.split("\n"):
        s = line.strip()
        m = re.match(r"!\[(.*?)\]\((.+?)\)", s)
        if not s:
            flush()
        elif s.startswith("## "):
            flush(); out.append(f"<h2>{e(s[3:])}</h2>")
        elif m:
            flush()
            alt, fn = m.groups()
            name = re.sub(r"[^A-Za-z0-9_.-]", "_", os.path.splitext(fn)[0]) + ".jpg"
            w, h = prep_image(resolve_img(srcdir, fn), os.path.join(outdir, name), 1400)
            out.append(f'<figure><img src="/blog/{slug}/{name}" alt="{e(alt)}" width="{w}" height="{h}" loading="lazy">'
                       + (f"<figcaption>{e(alt)}</figcaption>" if alt else "") + "</figure>")
        elif s.startswith("- "):
            if para:
                flush()
            lst.append(s[2:])
        else:
            if lst:
                flush()
            para.append(s)
    flush()
    return "\n".join(out)


def plain(body):
    t = re.sub(r"!\[.*?\]\(.*?\)", "", body)
    t = re.sub(r"^## ", "", t, flags=re.M)
    t = re.sub(r"^- ", "", t, flags=re.M)
    return re.sub(r"\s+", "", t)


HEAD_FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
              '<link href="https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400&family=Zen+Kaku+Gothic+New:wght@400;500&display=swap" rel="stylesheet">')


def header_html():
    return ('<header class="top"><a class="mk" href="/" aria-label="CAFE ＆ RESTAURANT POOL"><small>CAFE ＆ RESTAURANT</small><b>POOL</b><small>NARA</small></a>'
            '<nav aria-label="メニュー"><a href="/#wedding">WEDDING</a><a href="/blog/">DIARY</a><a href="/#plan">PLAN</a><a href="/#kanji">KANJI</a><a href="/#info">ACCESS</a><a href="/#faq">FAQ</a></nav>'
            f'<a class="tel" href="tel:{TEL}">TEL 050-5487-7047</a></header>')


def footer_html():
    return ('<div class="end"><div class="wrap"><h2>With Love</h2><p>あなたたちらしい一日を、ここで。まずはお気軽にご相談ください。</p>'
            f'<div class="cta"><a class="btn m" href="{RESERVE}">空席を確認して予約</a><a class="btn" href="tel:{TEL}">電話で相談する</a></div></div></div>'
            '<footer><div class="wrap"><p class="lock" style="margin-bottom:1.6rem"><span>CAFE ＆ RESTAURANT</span><b>POOL</b><span>NARA — WEDDING ＆ PARTY</span></p>'
            '<p>© CAFE &amp; RESTAURANT POOL</p></div></footer>'
            f'<a class="fl" href="{RESERVE}">予約する</a>')


def page(title, desc, canonical, og_img, body, ld, og_type="article", extra_head=""):
    return f'''<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="{og_type}"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="{e(NAME)}"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{canonical}"><meta property="og:image" content="{og_img}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(title)}"><meta name="twitter:description" content="{e(desc)}"><meta name="twitter:image" content="{og_img}">
<meta name="theme-color" content="#0a0a0a">
<meta name="google-site-verification" content="cWNu3yExFfcyvifqxkfCp_KqQhgLrslb8YvPYdLVnzY" />
<link rel="alternate" type="application/rss+xml" title="WEDDING DIARY｜{e(NAME)}" href="/blog/feed.xml">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🥂%3C/text%3E%3C/svg%3E">
{HEAD_FONTS}
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>{extra_head}
</head><body>
{header_html()}
{body}
{footer_html()}
</body></html>'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    global SRC_ROOT
    src, out = a.src, a.out
    SRC_ROOT = src
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, "blog"))
    shutil.copy(os.path.join(src, "base", "ogp.jpg"), out)
    shutil.copy(os.path.join(src, "base", "robots.txt"), out)
    shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "blog.css"), os.path.join(out, "blog", "blog.css"))

    posts = []
    pdir = os.path.join(src, "posts")
    for slug in sorted(os.listdir(pdir)) if os.path.isdir(pdir) else []:
        sd = os.path.join(pdir, slug)
        pm = os.path.join(sd, "post.md")
        if not os.path.isfile(pm):
            continue
        meta, body, d = parse_post(pm, slug)
        od = os.path.join(out, "blog", slug)
        os.makedirs(od)
        cover = None
        cw = ch = tw = th = 0
        if meta.get("photo"):
            cover = "cover.jpg"
            cw, ch = prep_image(resolve_img(sd, meta["photo"]), os.path.join(od, "cover.jpg"), 1600)
            tw, th = prep_image(resolve_img(sd, meta["photo"]), os.path.join(od, "thumb.jpg"), 640)
        content = md_body(body, slug, od, sd)
        txt = plain(body)
        excerpt = txt[:70] + ("…" if len(txt) > 70 else "")
        desc = (txt[:110] + ("…" if len(txt) > 110 else "")) or meta["title"]
        posts.append(dict(slug=slug, title=meta["title"], date=d, cover=cover, cw=cw, ch=ch, tw=tw, th=th, content=content, excerpt=excerpt, desc=desc))
    posts.sort(key=lambda p: (p["date"], p["slug"]), reverse=True)

    # individual pages
    for i, p in enumerate(posts):
        url = f"{SITE}/blog/{p['slug']}/"
        img = f"{SITE}/blog/{p['slug']}/cover.jpg" if p["cover"] else f"{SITE}/ogp.jpg"
        ds = p["date"].isoformat()
        title = f"{p['title']}｜WEDDING DIARY｜{NAME} 奈良"
        ld = [{"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"], "datePublished": ds, "dateModified": ds,
               "inLanguage": "ja", "mainEntityOfPage": url, "image": [img], "keywords": KEYWORDS,
               "author": {"@type": "Organization", "name": NAME}, "publisher": {"@type": "Organization", "name": NAME, "url": SITE + "/"}},
              {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                  {"@type": "ListItem", "position": 1, "name": "ホーム", "item": SITE + "/"},
                  {"@type": "ListItem", "position": 2, "name": "WEDDING DIARY", "item": SITE + "/blog/"},
                  {"@type": "ListItem", "position": 3, "name": p["title"], "item": url}]}]
        prev = posts[i + 1] if i + 1 < len(posts) else None
        nxt = posts[i - 1] if i > 0 else None
        pn = '<nav class="pn" aria-label="前後の記事">' + (f'<a href="/blog/{prev["slug"]}/">← {e(prev["title"])}</a>' if prev else "<span></span>") + \
             (f'<a href="/blog/{nxt["slug"]}/">{e(nxt["title"])} →</a>' if nxt else "<span></span>") + "</nav>"
        hero = f'<figure class="cv"><img src="/blog/{p["slug"]}/cover.jpg" alt="{e(p["title"])}" width="{p["cw"]}" height="{p["ch"]}"></figure>' if p["cover"] else ""
        body = (f'<main><article class="post"><div class="wrap narrow"><p class="crumb"><a href="/">HOME</a> / <a href="/blog/">WEDDING DIARY</a></p>'
                f'<time datetime="{ds}">{p["date"].strftime("%Y.%m.%d")}</time><h1>{e(p["title"])}</h1></div>{hero}'
                f'<div class="wrap narrow body">{p["content"]}'
                f'<aside class="cta-box"><b>奈良で、ウエディング二次会（2次会）を。</b><p>一軒家を貸し切る20〜60名のパーティー。空席のご確認、ご相談はこちらから。</p>'
                f'<div class="cta"><a class="btn m" href="{RESERVE}">空席を確認して予約</a><a class="btn" href="/#plan">プランを見る</a></div></aside>{pn}'
                f'<p><a class="btn" href="/blog/">記事の一覧へ</a></p></div></article></main>')
        open(os.path.join(out, "blog", p["slug"], "index.html"), "w", encoding="utf-8").write(
            page(title, desc if len(p["desc"]) > 20 else p["title"], url, img, body, ld))

    # archive
    def card(p, cls="dy-c"):
        im = f'<img src="/blog/{p["slug"]}/thumb.jpg" alt="{e(p["title"])}" width="{p["tw"]}" height="{p["th"]}" loading="lazy">' if p["cover"] else ''
        return (f'<a class="{cls}" href="/blog/{p["slug"]}/">{im}<time datetime="{p["date"].isoformat()}">{p["date"].strftime("%Y.%m.%d")}</time>'
                f'<b>{e(p["title"])}</b><span>{e(p["excerpt"])}</span></a>')

    ld = [{"@context": "https://schema.org", "@type": "Blog", "name": f"WEDDING DIARY｜{NAME}", "url": SITE + "/blog/", "inLanguage": "ja",
           "publisher": {"@type": "Organization", "name": NAME},
           "blogPost": [{"@type": "BlogPosting", "headline": p["title"], "url": f"{SITE}/blog/{p['slug']}/", "datePublished": p["date"].isoformat()} for p in posts[:20]]},
          {"@type": "BreadcrumbList", "@context": "https://schema.org", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "ホーム", "item": SITE + "/"},
              {"@type": "ListItem", "position": 2, "name": "WEDDING DIARY", "item": SITE + "/blog/"}]}]
    body = ('<main><section class="arch"><div class="wrap"><p class="crumb"><a href="/">HOME</a> / WEDDING DIARY</p><i class="lb">( WEDDING DIARY )</i>'
            '<h1>奈良のウエディング二次会・ブログ</h1><p>CAFE ＆ RESTAURANT POOL の毎日を綴っています。奈良での結婚式の二次会（2次会）、貸切パーティー、季節のお料理のこと。</p>'
            '<div class="dy-g">' + "".join(card(p) for p in posts) + '</div></div></section></main>')
    open(os.path.join(out, "blog", "index.html"), "w", encoding="utf-8").write(
        page(f"WEDDING DIARY｜奈良のウエディング二次会ブログ｜{NAME}", "奈良のウエディング二次会（2次会）・貸切パーティーの会場、CAFE & RESTAURANT POOLのブログ。季節のお料理、パーティーの様子、幹事さん向けの情報を毎日更新しています。",
             SITE + "/blog/", SITE + "/ogp.jpg", body, ld, og_type="website"))

    # RSS
    now = dt.datetime.now(dt.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    items = "".join(
        f"<item><title>{e(p['title'])}</title><link>{SITE}/blog/{p['slug']}/</link><guid>{SITE}/blog/{p['slug']}/</guid>"
        f"<pubDate>{p['date'].strftime('%a, %d %b %Y 09:00:00 +0900')}</pubDate><description>{e(p['desc'])}</description></item>" for p in posts[:30])
    open(os.path.join(out, "blog", "feed.xml"), "w", encoding="utf-8").write(
        f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>WEDDING DIARY｜{e(NAME)}</title><link>{SITE}/blog/</link>'
        f'<description>奈良のウエディング二次会・貸切パーティーのブログ</description><language>ja</language><lastBuildDate>{now}</lastBuildDate>{items}</channel></rss>')

    # sitemap（トップは5言語の相互リンク付き）
    last = posts[0]["date"].isoformat() if posts else dt.date.today().isoformat()
    alts = "".join(f'<xhtml:link rel="alternate" hreflang="{i18n.HREFLANG[k]}" href="{SITE}{i18n.PATHS[k]}"/>' for k in i18n.PATHS) + f'<xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/>'
    rows = [f"  <url><loc>{SITE}{i18n.PATHS[k]}</loc><lastmod>{last}</lastmod><changefreq>weekly</changefreq><priority>{'1.0' if k == 'ja' else '0.9'}</priority>{alts}</url>\n" for k in i18n.PATHS]
    urls = []
    if posts:
        urls.append((SITE + "/blog/", last, "daily", "0.8"))
        urls += [(f"{SITE}/blog/{p['slug']}/", p["date"].isoformat(), "yearly", "0.6") for p in posts]
    open(os.path.join(out, "sitemap.xml"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "".join(rows) +
        "".join(f"  <url><loc>{u}</loc><lastmod>{l}</lastmod><changefreq>{c}</changefreq><priority>{pr}</priority></url>\n" for u, l, c, pr in urls) + "</urlset>\n")

    # top page
    t = open(os.path.join(src, "base", "index.template.html"), encoding="utf-8").read()
    t_raw = t  # 多言語ページ用（日記ブロック挿入前）
    if posts:
        block = ('<div class="dy" id="diary"><i class="lb">( WEDDING DIARY )</i><h3 class="dy-h">奈良のウエディング二次会、毎日のブログ</h3><div class="dy-g">'
                 + "".join(card(p) for p in posts[:LATEST_ON_TOP]) + '</div><p class="dy-more"><a class="btn" href="/blog/">すべての記事を見る</a></p></div>')
        t = re.sub(r"<!--DIARY-START-->.*?<!--DIARY-END-->", lambda m: block, t, flags=re.S)
        t = t.replace("<!--NAV-BLOG-->", '<a href="/blog/">DIARY</a>')
    else:
        t = t.replace("<!--NAV-BLOG-->", "")
    t = i18n.apply_to_ja(t, SITE)
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(t)
    i18n.build_all(t_raw, out, SITE, "".join(card(p) for p in posts[:3]))
    print(f"OK: {len(posts)} 記事 -> {out}")


if __name__ == "__main__":
    main()
