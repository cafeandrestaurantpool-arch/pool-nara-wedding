"""GitHub Pages 用に、公開フォルダのリンクを書きかえる（GitHub Actions が自動で実行）。

GitHub Pages では、サイトが https://<ユーザー>.github.io/<リポジトリ名>/ に置かれるため、
「/img/…」のような先頭が / のリンクを「/<リポジトリ名>/img/…」に直す。
あわせて、旧 Netlify のアドレスを、新しい GitHub Pages のアドレスに置きかえる。

使い方: python3 tools/pages_fix.py <公開フォルダ> <リポジトリ名>
元の site/ フォルダは変更しない（Actions がコピーしてから実行する）。
"""
import os, re, sys

OWNER = 'cafeandrestaurantpool-arch'
# 旧アドレス → 新アドレス（サイト同士のリンクもここで直す）
MOVES = {
    'https://pool-nara.netlify.app': f'https://{OWNER}.github.io/pool-site',
    'https://pool-nara-wedding.netlify.app': f'https://{OWNER}.github.io/pool-nara-wedding',
}
TEXT = ('.html', '.xml', '.txt', '.css', '.js', '.json', '.webmanifest', '.svg')


def fix(text, base):
    for old, new in MOVES.items():
        text = text.replace(old, new)
    # href="/…" src="/…" action="/…" poster="/…"（"//" で始まるものは外部なので除く）
    text = re.sub(r'((?:href|src|action|poster|data-src)=["\'])/(?!/)', r'\1' + base + '/', text)
    # srcset の各候補
    def srcset(m):
        parts = [re.sub(r'^(\s*)/(?!/)', r'\1' + base + '/', p) for p in m.group(2).split(',')]
        return m.group(1) + ','.join(parts) + m.group(3)
    text = re.sub(r'(srcset=["\'])([^"\']*)(["\'])', srcset, text)
    # CSS の url(/…)
    text = re.sub(r'url\((["\']?)/(?!/)', r'url(\1' + base + '/', text)
    return text


def main():
    root, repo = sys.argv[1], sys.argv[2]
    base = '/' + repo
    n = 0
    for d, _, files in os.walk(root):
        for f in files:
            if not f.endswith(TEXT):
                continue
            p = os.path.join(d, f)
            s = open(p, encoding='utf-8').read()
            t = fix(s, base)
            if t != s:
                open(p, 'w', encoding='utf-8').write(t)
                n += 1
    # robots.txt の Sitemap 行などは MOVES で直る。404 ページがあれば、そのまま使われる。
    open(os.path.join(root, '.nojekyll'), 'w').close()
    print(f'ok {n} files fixed (base {base})')


if __name__ == '__main__':
    main()
