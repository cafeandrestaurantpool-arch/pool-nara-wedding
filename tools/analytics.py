"""Google Analytics 4 を、生成した全ページに1回だけ入れる（make_site.py の最後に自動で呼ばれる）。

- ページの閲覧数・流入元：GA4 の標準の page_view で計測する。
- 予約ボタン（ぐるなびの予約ページへのリンク）のクリック：reservation_click
- 電話ボタン（tel: のリンク）のクリック：phone_click
- リンクの動き（移動先・電話の発信）は変えない。クリックを横で記録するだけ。
- 二重設置を防ぐ：すでに測定IDが入っているページには入れない。
- 二重送信を防ぐ：クリックの記録は、ページ全体で1つだけ登録し、同じクリックは1回だけ送る。
"""
import os

GA_ID = "G-MOR6JDYLBK"
RESERVE_MATCH = "r.gnavi.co.jp/plan/ery83tn00000/plan-reserve"

SNIPPET = (
    f'<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>'
    "<script>(function(){if(window.__poolGa4)return;window.__poolGa4=1;"
    "window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};"
    f"gtag('js',new Date());gtag('config','{GA_ID}');"
    "document.addEventListener('click',function(e){if(e.__poolGa4)return;e.__poolGa4=1;"
    "var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;"
    "var h=a.getAttribute('href')||'',n=null;"
    f"if(h.indexOf('{RESERVE_MATCH}')>-1)n='reservation_click';else if(h.lastIndexOf('tel:',0)===0)n='phone_click';"
    "if(!n)return;"
    "gtag('event',n,{link_url:a.href,link_text:(a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,100),"
    "page_language:document.documentElement.lang||'',transport_type:'beacon'})},true)})();</script>"
)


def add_ga4(out):
    """out 以下の .html（Search Console の確認ファイルを除く）の </head> の直前に、1回だけ入れる。"""
    n = 0
    for root, _, files in os.walk(out):
        for f in files:
            if not f.endswith(".html") or f.startswith("google"):
                continue
            p = os.path.join(root, f)
            h = open(p, encoding="utf-8").read()
            if GA_ID in h or "</head>" not in h:
                continue
            open(p, "w", encoding="utf-8").write(h.replace("</head>", SNIPPET + "</head>", 1))
            n += 1
    return n
