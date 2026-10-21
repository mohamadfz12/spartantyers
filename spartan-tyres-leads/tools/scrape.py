"""Pull contact details from a company website for lead research.

Usage:
  python tools/scrape.py https://example.com.au [more urls...]

For each site it fetches the home page plus up to three likely contact /
about / locations pages, and prints one JSON object per site:

  {"url", "final_url", "ok", "title", "description", "phones", "emails",
   "addresses", "contact_page", "pages", "employee_hints", "fleet_hints",
   "nsw_postcodes", "error"}

- phones: Australian numbers in display form, de-duplicated
- emails: mailto links, plain text, and Cloudflare-protected addresses decoded
- addresses: text fragments containing a NSW postcode
- employee_hints / fleet_hints: sentences mentioning staff or truck numbers,
  for judging company size — read them, don't trust a number blindly

Pages are cached in tools/.cache/pages, so re-scraping a site is free.
"""
import hashlib, html, json, os, re, sys, time, urllib.parse, urllib.request, ssl

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache", "pages")
os.makedirs(CACHE, exist_ok=True)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE  # many small business sites have broken chains

CONTACT_WORDS = re.compile(r"contact|about|location|branch|depot|store|find-us|our-team|team|staff", re.I)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
BAD_EMAIL = re.compile(r"\.(png|jpe?g|gif|webp|svg|css|js)$|example\.|sentry|wixpress|"
                       r"godaddy|@2x|domain\.com|email\.com|yourname|name@|user@|"
                       r"squarespace|wordpress|cloudflare", re.I)
PHONE_RE = re.compile(
    r"(?<![\d])(?:\+?61[\s.-]?|\(?0)"          # +61 or (0 / 0
    r"(?:[2378]\)?[\s.-]?\d{4}[\s.-]?\d{4}"      # landline
    r"|4\d{2}[\s.-]?\d{3}[\s.-]?\d{3})"          # mobile
    r"(?![\d])"
    r"|(?<![\d])1[38]00[\s.-]?\d{3}[\s.-]?\d{3}(?![\d])"   # 1300 / 1800
    r"|(?<![\d])13[\s.-]?\d{2}[\s.-]?\d{2}(?![\d])")       # 13 xx xx
POSTCODE_ADDR = re.compile(r"[^<>\n]{0,90}\bN\.?S\.?W\.?,?\s+2\d{3}\b")
EMP_HINT = re.compile(r"[^.<>]{0,120}\b(\d{1,4}\+?)\s*(?:staff|employees|people|team members|drivers)\b[^.<>]{0,60}", re.I)
FLEET_HINT = re.compile(r"[^.<>]{0,120}\b(\d{1,4}\+?)\s*(?:trucks|vehicles|prime movers|trailers|units|b-doubles)\b[^.<>]{0,60}", re.I)


def get(url):
    key = hashlib.sha1(url.encode()).hexdigest()
    path = os.path.join(CACHE, key + ".json")
    if os.path.exists(path):
        c = json.load(open(path, encoding="utf-8"))
        return c["final"], c["body"]
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-AU,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
        final = r.geturl()
        raw = r.read(1_500_000)
        enc = r.headers.get_content_charset() or "utf-8"
    body = raw.decode(enc, "replace")
    json.dump({"final": final, "body": body}, open(path, "w", encoding="utf-8"))
    return final, body


def decode_cfemail(hexstr):
    try:
        key = int(hexstr[:2], 16)
        return "".join(chr(int(hexstr[i:i + 2], 16) ^ key) for i in range(2, len(hexstr), 2))
    except Exception:
        return ""


def fmt_phone(raw):
    d = re.sub(r"\D", "", raw)
    if d.startswith("61"):
        d = "0" + d[2:]
    if len(d) == 10 and d.startswith(("13", "18")):
        return f"{d[:4]} {d[4:7]} {d[7:]}"
    if len(d) == 6 and d.startswith("13"):
        return f"{d[:2]} {d[2:4]} {d[4:]}"
    if len(d) == 10 and d.startswith("04"):
        return f"{d[:4]} {d[4:7]} {d[7:]}"
    if len(d) == 10 and d[:2] in ("02", "03", "07", "08"):
        return f"({d[:2]}) {d[2:6]} {d[6:]}"
    return None


def text_of(body):
    body = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", body)
    return html.unescape(re.sub(r"(?s)<[^>]+>", " \n ", body))


def extract(body):
    emails, phones = [], []
    for m in re.finditer(r'href=["\']mailto:([^"\'?]+)', body, re.I):
        emails.append(urllib.parse.unquote(m.group(1)))
    for m in re.finditer(r'data-cfemail=["\']([0-9a-fA-F]+)', body):
        emails.append(decode_cfemail(m.group(1)))
    for m in re.finditer(r'/cdn-cgi/l/email-protection#([0-9a-fA-F]+)', body):
        emails.append(decode_cfemail(m.group(1)))
    txt = text_of(body)
    emails += EMAIL_RE.findall(txt)
    for m in re.finditer(r'href=["\']tel:([^"\']+)', body, re.I):
        phones.append(urllib.parse.unquote(m.group(1)))
    phones += [m.group(0) for m in PHONE_RE.finditer(txt)]
    # Local numbers written without the area code ("Ring us 9624 7766") are
    # common on NSW sites. Only taken after a phone cue, never after "fax";
    # NSW is the 02 area, so that is what is assumed.
    flat_txt = re.sub(r"\s+", " ", txt)
    for m in re.finditer(r"(?i)\b(phone|ph|tel|telephone|call|ring|office|mob)\b[^0-9]{0,14}(?<!\d)(\d{4}[\s.-]?\d{4})(?![\d])", flat_txt):
        if not re.search(r"(?i)fax", flat_txt[max(0, m.start() - 6):m.start(2)]):
            phones.append("02" + re.sub(r"\D", "", m.group(2)))
    title = re.search(r"(?is)<title[^>]*>(.*?)</title>", body)
    desc = (re.search(r'(?is)<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)', body)
            or re.search(r'(?is)<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']*)', body))
    flat = re.sub(r"\s+", " ", txt)
    return {
        "emails": emails, "phones": phones,
        "title": html.unescape(title.group(1)).strip() if title else "",
        "description": html.unescape(desc.group(1)).strip() if desc else "",
        "addresses": [re.sub(r"\s+", " ", m.group(0)).strip(" ,|-") for m in POSTCODE_ADDR.finditer(flat)],
        "employee_hints": [re.sub(r"\s+", " ", m.group(0)).strip() for m in EMP_HINT.finditer(flat)],
        "fleet_hints": [re.sub(r"\s+", " ", m.group(0)).strip() for m in FLEET_HINT.finditer(flat)],
    }


def candidate_links(base, body):
    host = urllib.parse.urlparse(base).netloc
    out = []
    for m in re.finditer(r'href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', body, re.I | re.S):
        href, label = m.group(1), re.sub(r"<[^>]+>", "", m.group(2))
        if href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        u = urllib.parse.urljoin(base, href)
        if urllib.parse.urlparse(u).netloc != host:
            continue
        if CONTACT_WORDS.search(href) or CONTACT_WORDS.search(label):
            if u not in out:
                out.append(u)
    out.sort(key=lambda u: (0 if "contact" in u.lower() else 1, len(u)))
    return out[:3]


def scrape(url):
    if not url.startswith("http"):
        url = "https://" + url
    res = {"url": url, "final_url": "", "ok": False, "title": "", "description": "", "phones": [],
           "emails": [], "addresses": [], "contact_page": "", "pages": [], "employee_hints": [],
           "fleet_hints": [], "nsw_postcodes": [], "error": ""}
    try:
        final, body = get(url)
    except Exception as e:
        if url.startswith("https://"):
            try:
                final, body = get("http://" + url[8:])
            except Exception as e2:
                res["error"] = str(e2)[:160]
                return res
        else:
            res["error"] = str(e)[:160]
            return res
    res["ok"], res["final_url"] = True, final
    pages = [(final, body)]
    for link in candidate_links(final, body):
        try:
            pages.append(get(link))
            time.sleep(0.4)
        except Exception:
            pass
    agg = {k: [] for k in ("emails", "phones", "addresses", "employee_hints", "fleet_hints")}
    for i, (u, b) in enumerate(pages):
        x = extract(b)
        if i == 0:
            res["title"], res["description"] = x["title"], x["description"]
        if "contact" in u.lower() and not res["contact_page"]:
            res["contact_page"] = u
        for k in agg:
            agg[k] += x[k]
        res["pages"].append(u)
    seen = set()
    for e in agg["emails"]:
        e = e.strip().strip(".,;:").lower()
        if EMAIL_RE.fullmatch(e) and not BAD_EMAIL.search(e) and e not in seen:
            seen.add(e); res["emails"].append(e)
    seen = set()
    for p in agg["phones"]:
        f = fmt_phone(p)
        if f and f not in seen:
            seen.add(f); res["phones"].append(f)
    for k in ("addresses", "employee_hints", "fleet_hints"):
        res[k] = list(dict.fromkeys(agg[k]))[:6]
    res["nsw_postcodes"] = sorted(set(re.findall(r"\bNSW,?\s+(2\d{3})\b", " ".join(res["addresses"]))))
    return res


if __name__ == "__main__":
    for u in sys.argv[1:]:
        print(json.dumps(scrape(u), ensure_ascii=False))
