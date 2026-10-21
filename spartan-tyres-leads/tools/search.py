"""Web search for lead research. DuckDuckGo HTML, falling back to Bing.

Usage:
  python tools/search.py "truck tyres Dubbo NSW"            # 1 query
  python tools/search.py "query one" "query two" ...         # several
  python tools/search.py --pages 2 "query"                   # deeper

Prints one JSON line per result: {"q","title","url","snippet"}.
Results are cached in tools/.cache, so repeating a query is free.
Directory / aggregator sites (yellowpages, truelocal, facebook, ...) are kept,
because their titles name real businesses, but they are flagged "dir": true.
"""
import hashlib, html, json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache", "search")
os.makedirs(CACHE, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
DIRECTORY = re.compile(r"yellowpages|truelocal|facebook|linkedin|instagram|hotfrog|startlocal|"
                       r"localsearch|yelp|abn|seek\.com|indeed|wikipedia|youtube|tiktok|cylex|"
                       r"aussieweb|oneflare|hipages|word of mouth|womo|google\.|bing\.|duckduckgo|"
                       r"gumtree|carsales|truckscout|tradingpost|whitepages|zoominfo|dnb\.com|"
                       r"apollo\.io|rocketreach|crunchbase|opencorporates|infobel|brownbook", re.I)


def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers={
        "User-Agent": UA, "Accept-Language": "en-AU,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def ddg(q, page):
    params = {"q": q, "kl": "au-en"}
    if page:
        params["s"] = str(30 * page)
    body = fetch("https://html.duckduckgo.com/html/", urllib.parse.urlencode(params).encode())
    if "anomaly" in body.lower() and "result__a" not in body:
        raise RuntimeError("ddg rate-limited")
    out = []
    for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(.*?)'
                         r'(?=<a[^>]+class="result__a"|$)', body, re.S):
        href, title, rest = m.groups()
        href = html.unescape(href)
        u = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("uddg", [href])[0]
        if "duckduckgo.com/y.js" in u:  # ad
            continue
        sn = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', rest, re.S)
        out.append({"title": strip(title), "url": u, "snippet": strip(sn.group(1) if sn else "")})
    return out


def bing(q, page):
    url = "https://www.bing.com/search?" + urllib.parse.urlencode(
        {"q": q, "cc": "AU", "setlang": "en-AU", "first": str(1 + 10 * page)})
    body = fetch(url)
    out = []
    for m in re.finditer(r'<li class="b_algo"(.*?)</li>', body, re.S):
        block = m.group(1)
        a = re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
        if not a:
            continue
        sn = re.search(r'<p[^>]*>(.*?)</p>', block, re.S)
        out.append({"title": strip(a.group(2)), "url": html.unescape(a.group(1)),
                    "snippet": strip(sn.group(1) if sn else "")})
    return out


def search(q, pages=1):
    key = hashlib.sha1(f"{q}|{pages}".encode()).hexdigest()
    path = os.path.join(CACHE, key + ".json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    results = []
    for page in range(pages):
        got = []
        for engine in (ddg, bing):
            for attempt in range(2):
                try:
                    got = engine(q, page)
                    break
                except Exception:
                    time.sleep(3 + 4 * attempt)
            if got:
                break
        results += got
        time.sleep(1.2)
    seen, uniq = set(), []
    for r in results:
        u = r["url"].split("#")[0]
        if u in seen:
            continue
        seen.add(u)
        r["dir"] = bool(DIRECTORY.search(u))
        uniq.append(r)
    json.dump(uniq, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    return uniq


if __name__ == "__main__":
    args = sys.argv[1:]
    pages = 1
    if args[:1] == ["--pages"]:
        pages, args = int(args[1]), args[2:]
    for q in args:
        for r in search(q, pages):
            print(json.dumps({"q": q, **r}, ensure_ascii=False))
