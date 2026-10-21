"""Spartan Tyres NSW lead list: merge research JSON -> leads.json, .xlsx, .html.

Usage: python build.py <dir-with-research-json>
"""
import json, re, sys, glob, os, datetime, hashlib
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1]
TODAY = datetime.date.today().isoformat()

REGIONS = ["Metro", "N NSW", "W NSW", "S NSW"]
REGION_ALIASES = {
    "metro": "Metro", "sydney metro": "Metro", "sydney": "Metro", "greater sydney": "Metro",
    "n nsw": "N NSW", "northern nsw": "N NSW", "north nsw": "N NSW",
    "w nsw": "W NSW", "western nsw": "W NSW", "west nsw": "W NSW",
    "s nsw": "S NSW", "southern nsw": "S NSW", "south nsw": "S NSW",
}
CATS = {"transport": "Transport", "truck tyre reseller": "Truck Tyre Reseller"}
EMP = {"<10": "<10", "less than 10": "<10", "1-9": "<10", "10-30": "10–30", "10–30": "10–30",
       "30-50": "30–50", "30–50": "30–50", "50+": "50+", "50 +": "50+"}
EMP_ORDER = ["<10", "10–30", "30–50", "50+", ""]
# research agents named Sydney sub-areas loosely; fold them into one set
METRO_AREAS = [
    ("port botany", "South Sydney & Port Botany"), ("south sydney", "South Sydney & Port Botany"),
    ("eastern suburbs", "South Sydney & Port Botany"), ("st george", "South Sydney & Port Botany"),
    ("bankstown", "South West Sydney"), ("south west", "South West Sydney"), ("macarthur", "Macarthur"),
    ("inner west", "Inner West"), ("inner sydney", "Inner Sydney"), ("hills", "Hills & Hawkesbury"),
    ("hawkesbury", "Hills & Hawkesbury"), ("northern beaches", "Northern Beaches"),
    ("northern sydney", "Northern Sydney"), ("sutherland", "Sutherland Shire"), ("western sydney", "Western Sydney"),
]
CITY_AREA = {"riverstone": "Hills & Hawkesbury", "sydney": "Inner Sydney"}
SIZE_ORDER = ["Large", "Medium", "Small", ""]


def norm_name(n):
    n = n.lower().replace("&", " and ")
    n = re.sub(r"\b(pty|ltd|limited|the|group|australia|aust|nsw)\b", " ", n)
    return re.sub(r"[^a-z0-9]+", "", n)


def norm_url(u):
    u = (u or "").strip()
    if not u or " " in u:
        return ""
    if not u.startswith("http"):
        u = "https://" + u
    return u.rstrip("/")


def norm_phone(p):
    p = (p or "").strip()
    label = ""
    m = re.match(r"^\s*([A-Za-z][A-Za-z /]*?)\s*[:\-]\s*(.+)$", p)
    if m:
        label, p = m.group(1).strip().title(), m.group(2)
    d = re.sub(r"\D", "", p)
    if d.startswith("61") and len(d) == 11:
        d = "0" + d[2:]
    if len(d) == 10 and d.startswith(("13", "18")):
        f = f"{d[:4]} {d[4:7]} {d[7:]}"
    elif len(d) == 6 and d.startswith("13"):
        f = f"{d[:2]} {d[2:4]} {d[4:]}"
    elif len(d) == 10 and d.startswith("04"):
        f = f"{d[:4]} {d[4:7]} {d[7:]}"
    elif len(d) == 10:
        f = f"({d[:2]}) {d[2:6]} {d[6:]}"
    elif len(d) == 8:
        f = f"(02) {d[:4]} {d[4:]}"; d = "02" + d
    else:
        return None, None
    return d, (f"{label}: {f}" if label else f)


EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def clean(r):
    out = {k: (r.get(k) or "") if not isinstance(r.get(k), list) else r.get(k) for k in r}
    out["name"] = re.sub(r"\s+", " ", str(r.get("name", "")).strip())
    out["category"] = CATS.get(str(r.get("category", "")).strip().lower(), r.get("category", ""))
    reg = str(r.get("region", "")).strip()
    out["region"] = REGION_ALIASES.get(reg.lower(), reg)
    out["website"] = norm_url(r.get("website"))
    out["contact_page"] = norm_url(r.get("contact_page"))
    phones, seen = [], set()
    for p in r.get("phones") or []:
        d, f = norm_phone(str(p))
        if d and d not in seen:
            seen.add(d); phones.append(f)
    out["phones"] = phones
    emails = []
    for e in r.get("emails") or []:
        e = str(e).strip().lower().removeprefix("mailto:")
        if EMAIL_RE.match(e) and e not in emails:
            emails.append(e)
    out["emails"] = emails
    s = str(r.get("size", "")).strip().title()
    out["size"] = s if s in SIZE_ORDER else ""
    e = str(r.get("employees", "")).strip().replace(" ", "")
    out["employees"] = EMP.get(e, EMP.get(e.replace("–", "-"), ""))
    for k in ["subtype", "description", "area", "city", "address", "other_contacts",
              "fleet", "size_basis", "source"]:
        out[k] = re.sub(r"\s+", " ", str(r.get(k) or "")).strip()
    out["name"] = out["name"].replace(" - ", " – ")
    if out["region"] == "Metro":
        a = out["area"].lower()
        out["area"] = next((v for k, v in METRO_AREAS if k in a),
                           CITY_AREA.get(out["city"].lower(), out["area"] or "Sydney (other)"))
    return out


def merge(a, b):
    for k in ["phones", "emails"]:
        for v in b[k]:
            if v not in a[k]:
                a[k].append(v)
    for k, v in b.items():
        if not isinstance(v, list) and v and not a.get(k):
            a[k] = v
    return a


# ---------------------------------------------------------------- contact hygiene
# Scraping a company site also scrapes its footer, its head office and its
# web designer. These rules strip what is not a way to reach THIS business in
# NSW. Each rule only removes; nothing is ever invented or reformatted here.

FREE_MAIL = {
    "gmail.com", "bigpond.com", "bigpond.net.au", "hotmail.com", "hotmail.com.au", "outlook.com",
    "outlook.com.au", "yahoo.com", "yahoo.com.au", "live.com", "live.com.au", "icloud.com",
    "optusnet.com.au", "iinet.net.au", "tpg.com.au", "westnet.com.au", "internode.on.net",
    "skymesh.com.au", "activ8.net.au", "aapt.net.au", "dodo.com.au", "exetel.com.au", "me.com",
}
PLACEHOLDER_EMAIL = re.compile(r"^(mymail@mailservice\.com|email@|name@|your|test@|example@)", re.I)
ROLE_JUNK = re.compile(r"^(careers?|jobs?|recruit\w*|hr|privacy|no-?reply|donotreply|webmaster|"
                       r"integrations?|compliance|marketing|media|press|abuse|postmaster)[@.]", re.I)
INTERSTATE = re.compile(r"(^|[._-])(melbourne|melb|vic|victoria|brisbane|bris|qld|queensland|perth|wa|"
                        r"adelaide|sa|tas|tasmania|hobart|darwin|nt)(depot|warehouse|office|containers?)?"
                        r"([._-]|@)", re.I)
GENERIC_TOKENS = {"transport", "transports", "logistics", "group", "tyres", "tyre", "australia",
                  "australian", "freight", "services", "service", "trucks", "truck", "haulage", "pty",
                  "ltd", "and", "the", "nsw", "sydney", "auto", "automotive", "co", "company",
                  "carriers", "distribution", "express", "national", "solutions", "hire"}


def _domain_label(d):
    d = d.lower().split("@")[-1]
    d = re.sub(r"^(www|mail)\.", "", d)
    return d.split(".")[0]


def _related_domain(email_domain, lead):
    """True when an off-site email domain plausibly belongs to the same business."""
    label = _domain_label(email_domain)
    site = _domain_label(re.sub(r"^https?://", "", lead["website"]).split("/")[0]) if lead["website"] else ""
    if site and (label in site or site in label):
        return True
    tokens = [t for t in re.findall(r"[a-z0-9]+", lead["name"].lower())
              if len(t) >= 3 and t not in GENERIC_TOKENS]
    return any(t in label for t in tokens)


LOCAL_INTERSTATE_CODES = {
    "Murray": ("03",),
    "Far West": ("03", "08"),
    "Northern Rivers": ("07",),
    "North West": ("07",),
    "New England": ("07",),
}


def _phone_digits(p):
    return re.sub(r"\D", "", p.split(":")[-1])


def sanitise(rows):
    removed = {"shared": 0, "interstate": 0, "email": 0}
    owners = {}
    for r in rows:
        for p in r["phones"]:
            owners.setdefault(_phone_digits(p), set()).add(norm_name(r["name"]).split()[0] if r["name"] else "")
    for r in rows:
        digits = [_phone_digits(p) for p in r["phones"]]
        has_nsw_number = any(d[:2] in ("02", "04", "13", "18") for d in digits)
        keep = []
        for p, d in zip(r["phones"], digits):
            shared = len(owners.get(d, ())) >= 3
            # Parts of NSW are on other states' area codes: the Murray towns
            # (Deniliquin, Moama, Finley, Barham…) and Wentworth are 03, the
            # Tweed and the Queensland border towns are 07, Broken Hill is 08.
            local_code = LOCAL_INTERSTATE_CODES.get(r["area"], ())
            interstate = d[:2] in ("03", "07", "08") and d[:2] not in local_code
            if shared:
                removed["shared"] += 1
                continue
            # Only strip an interstate number when the lead has an NSW one to
            # fall back on; otherwise it may well be the business's own line.
            if interstate and has_nsw_number:
                removed["interstate"] += 1
                continue
            keep.append(p)
        # Never strip a lead down to nothing: if every number was filtered,
        # keep the first original so the lead can still be called.
        r["phones"] = keep or r["phones"][:1]

        good = []
        for e in r["emails"]:
            domain = e.split("@")[-1]
            bad = (PLACEHOLDER_EMAIL.search(e) or ROLE_JUNK.search(e) or INTERSTATE.search(e)
                   or (domain not in FREE_MAIL and not _related_domain(domain, r)))
            if bad:
                removed["email"] += 1
            else:
                good.append(e)
        r["emails"] = good[:6]
    return removed


def load():
    rows = []
    for f in sorted(glob.glob(os.path.join(SRC, "*.json"))):
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception as ex:
            print("BAD JSON", f, ex); continue
        print(f"{os.path.basename(f)}: {len(data)}")
        enrich = os.path.basename(f).startswith("zz_enrich")
        rows += [dict(clean(r), _enrich=enrich) for r in data if r.get("name")]
    by_key = {}
    for r in rows:
        enrich = r.pop("_enrich")
        if r["region"] not in REGIONS or r["category"] not in CATS.values():
            print("skip (region/category)", r["name"], r["region"], r["category"]); continue
        # chain branches share a domain, so the key includes the town
        key = (r["category"], norm_name(r["name"]), r["city"].lower() if "–" in r["name"] or " - " in r["name"] else "")
        k2 = (r["category"], r["website"].lower(), r["city"].lower()) if r["website"] else None
        hit = by_key.get(key) or (by_key.get(k2) if k2 else None)
        if hit:
            if enrich and r["other_contacts"] and r["other_contacts"] not in hit["other_contacts"]:
                hit["other_contacts"] = "; ".join(x for x in [hit["other_contacts"], r["other_contacts"]] if x)
            merge(hit, r)
        elif enrich:
            print("enrichment row matched nothing:", r["name"])
        else:
            by_key[key] = r
            if k2:
                by_key[k2] = r
    uniq = list({id(v): v for v in by_key.values()}.values())
    removed = sanitise(uniq)
    print(f"hygiene: removed {removed['shared']} shared head-office numbers, "
          f"{removed['interstate']} interstate numbers, {removed['email']} unrelated/junk emails")
    for r in uniq:
        p, e = bool(r["phones"]), bool(r["emails"])
        r["reach"] = "Phone + Email" if p and e else "Phone only" if p else "Email only" if e else "Website only"
        score = {"Large": 3, "Medium": 3, "Small": 2}.get(r["size"], 1)
        score += 1 if p else 0
        score += 1 if e else 0
        r["priority"] = "A" if score >= 5 else "B" if score >= 4 else "C"
        # chain stores that only list light-truck tyres are weak truck-tyre prospects
        if re.search(r"light truck only|light-truck only", r["description"] + " " + r["subtype"], re.I):
            r["priority"] = "C"
        # Resellers not confirmed to do truck tyres, and operators seen in a
        # single directory listing only, are real but unproven: they never
        # outrank a lead that has been confirmed.
        if re.search(r"truck service unverified|truck/ag unverified", r["description"] + " " + r["subtype"], re.I):
            r["priority"] = "C"
        if re.search(r"single directory listing", r["size_basis"], re.I):
            r["priority"] = "C"
    uniq.sort(key=lambda r: (r["category"], REGIONS.index(r["region"]), r["area"], r["city"], r["name"]))
    # `id` is a row number for the spreadsheet and changes whenever leads are
    # added. `key` must not: the admin stores each lead's status and notes
    # against it, so it is derived from what identifies the company.
    seen_keys = set()
    for i, r in enumerate(uniq, 1):
        r["id"] = i
        base = hashlib.sha1(f'{r["category"]}|{norm_name(r["name"])}|{norm_name(r["city"])}'.encode()).hexdigest()[:12]
        key, n = base, 1
        while key in seen_keys:
            n += 1
            key = f"{base}-{n}"
        seen_keys.add(key)
        r["key"] = key
    return uniq


# ---------------------------------------------------------------- Excel
ORANGE, INK, GREY = "F26522", "1A1A1A", "F4F4F2"
HDR_FONT = Font(name="Arial", bold=True, color="FFFFFF", size=10)
BODY = Font(name="Arial", size=10)
LINK = Font(name="Arial", size=10, color="0563C1", underline="single")
THIN = Side(style="thin", color="D9D9D9")

COLS = [  # header, key, width
    ("#", "id", 6), ("Company", "name", 34), ("Category", "category", 18), ("Type", "subtype", 24),
    ("Region", "region", 9), ("Area", "area", 20), ("City / Suburb", "city", 18),
    ("Address", "address", 36), ("Potential", "size", 10), ("Employees", "employees", 11),
    ("Fleet / Scale", "fleet", 16), ("Priority", "priority", 9), ("Reach", "reach", 14),
    ("Phone 1", "p1", 18), ("Phone 2", "p2", 18), ("Other phones", "p3", 24),
    ("Email 1", "e1", 30), ("Other emails", "e2", 34), ("Website", "website", 34),
    ("Contact page", "contact_page", 34), ("Description", "description", 60),
    ("Other contacts / people", "other_contacts", 40), ("Size basis", "size_basis", 30),
    ("Source", "source", 34), ("Status", "_status", 14), ("Notes", "_notes", 30),
]
STATUSES = ["New", "Called", "Interested", "Quote sent", "Customer", "Not interested", "Wrong number"]


def cell_val(r, key):
    if key == "p1": return r["phones"][0] if r["phones"] else ""
    if key == "p2": return r["phones"][1] if len(r["phones"]) > 1 else ""
    if key == "p3": return " · ".join(r["phones"][2:])
    if key == "e1": return r["emails"][0] if r["emails"] else ""
    if key == "e2": return " · ".join(r["emails"][1:])
    if key == "_status": return "New"
    if key == "_notes": return ""
    return r.get(key, "")


def lead_sheet(wb, title, rows, tab):
    ws = wb.create_sheet(title)
    ws.sheet_properties.tabColor = tab
    for c, (h, _, w) in enumerate(COLS, 1):
        x = ws.cell(row=1, column=c, value=h)
        x.font = HDR_FONT; x.fill = PatternFill("solid", fgColor=INK)
        x.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.row_dimensions[1].height = 28
    for i, r in enumerate(rows, 2):
        for c, (_, k, _) in enumerate(COLS, 1):
            v = cell_val(r, k)
            x = ws.cell(row=i, column=c, value=v)
            x.font = BODY
            x.alignment = Alignment(vertical="top", wrap_text=k in ("description", "other_contacts", "address"))
            x.border = Border(bottom=THIN)
            if k in ("website", "contact_page", "source") and v:
                x.hyperlink = v; x.font = LINK
            elif k == "e1" and v:
                x.hyperlink = "mailto:" + v; x.font = LINK
            elif k == "p1" and v and ":" not in v:
                x.hyperlink = "tel:" + re.sub(r"\D", "", v); x.font = LINK
        if i % 2 == 1:
            for c in range(1, len(COLS) + 1):
                ws.cell(row=i, column=c).fill = PatternFill("solid", fgColor=GREY)
    last = len(rows) + 1
    ref = f"A1:{get_column_letter(len(COLS))}{last}"
    ws.auto_filter.ref = ref
    ws.freeze_panes = "C2"
    sc = get_column_letter([k for _, k, _ in COLS].index("_status") + 1)
    dv = DataValidation(type="list", formula1='"' + ",".join(STATUSES) + '"', allow_blank=True)
    ws.add_data_validation(dv); dv.add(f"{sc}2:{sc}{max(last, 2)}")
    pc = get_column_letter([k for _, k, _ in COLS].index("priority") + 1)
    ws.conditional_formatting.add(f"{pc}2:{pc}{last}", FormulaRule(formula=[f'{pc}2="A"'],
                                  font=Font(name="Arial", bold=True, color=ORANGE)))
    ws.conditional_formatting.add(f"{sc}2:{sc}{last}", FormulaRule(formula=[f'{sc}2="Customer"'],
                                  fill=PatternFill("solid", fgColor="D9EAD3")))
    return ws


def summary_sheet(wb, rows):
    ws = wb.active; ws.title = "Summary"
    ws.sheet_properties.tabColor = ORANGE
    ws.sheet_view.showGridLines = False
    for col, w in zip("ABCDEFGH", [26, 14, 14, 14, 14, 14, 4, 40]):
        ws.column_dimensions[col].width = w
    ws["A1"] = "SPARTAN TYRES — NSW Lead List"
    ws["A1"].font = Font(name="Arial", bold=True, size=18, color=INK)
    ws["A2"] = (f"Transport operators running trucks in NSW + truck tyre resellers. "
                f"Compiled {TODAY} from public web sources (company sites, directories, store locators).")
    ws["A2"].font = Font(name="Arial", size=10, color="666666")
    L = "'All Leads'"
    col = {k: get_column_letter(i) for i, (_, k, _) in enumerate(COLS, 1)}
    n = len(rows) + 1
    rng = lambda k: f"{L}!${col[k]}$2:${col[k]}${n}"

    def header(r, labels):
        for c, h in enumerate(labels, 1):
            x = ws.cell(row=r, column=c, value=h)
            x.font = HDR_FONT; x.fill = PatternFill("solid", fgColor=INK)
            x.alignment = Alignment(horizontal="center" if c > 1 else "left")

    def bold_total(r, ncols):
        for c in range(1, ncols + 1):
            ws.cell(row=r, column=c).font = Font(name="Arial", bold=True)
            ws.cell(row=r, column=c).border = Border(top=Side(style="thin", color=INK))

    # 1. region x category
    r0 = 4
    ws.cell(row=r0, column=1, value="Leads by region").font = Font(name="Arial", bold=True, size=12, color=ORANGE)
    header(r0 + 1, ["Region", "Transport", "Tyre Resellers", "Total", "With email", "With phone"])
    for i, reg in enumerate(REGIONS):
        rr = r0 + 2 + i
        ws.cell(row=rr, column=1, value=reg).font = BODY
        ws.cell(row=rr, column=2, value=f'=COUNTIFS({rng("region")},A{rr},{rng("category")},"Transport")')
        ws.cell(row=rr, column=3, value=f'=COUNTIFS({rng("region")},A{rr},{rng("category")},"Truck Tyre Reseller")')
        ws.cell(row=rr, column=4, value=f"=B{rr}+C{rr}")
        ws.cell(row=rr, column=5, value=f'=COUNTIFS({rng("region")},A{rr},{rng("e1")},"?*")')
        ws.cell(row=rr, column=6, value=f'=COUNTIFS({rng("region")},A{rr},{rng("p1")},"?*")')
    tr = r0 + 2 + len(REGIONS)
    ws.cell(row=tr, column=1, value="Total")
    for c in "BCDEF":
        ws[f"{c}{tr}"] = f"=SUM({c}{r0+2}:{c}{tr-1})"
    bold_total(tr, 6)

    # 2. potential x category
    r1 = tr + 3
    ws.cell(row=r1, column=1, value="Leads by potential").font = Font(name="Arial", bold=True, size=12, color=ORANGE)
    header(r1 + 1, ["Potential", "Transport", "Tyre Resellers", "Total"])
    for i, s in enumerate(["Large", "Medium", "Small"]):
        rr = r1 + 2 + i
        ws.cell(row=rr, column=1, value=s)
        ws.cell(row=rr, column=2, value=f'=COUNTIFS({rng("size")},A{rr},{rng("category")},"Transport")')
        ws.cell(row=rr, column=3, value=f'=COUNTIFS({rng("size")},A{rr},{rng("category")},"Truck Tyre Reseller")')
        ws.cell(row=rr, column=4, value=f"=B{rr}+C{rr}")

    # 3. employees
    r2 = r1 + 7
    ws.cell(row=r2, column=1, value="Leads by employees (estimate)").font = Font(name="Arial", bold=True, size=12, color=ORANGE)
    header(r2 + 1, ["Employees", "Transport", "Tyre Resellers", "Total"])
    for i, s in enumerate(["<10", "10–30", "30–50", "50+"]):
        rr = r2 + 2 + i
        ws.cell(row=rr, column=1, value=s)
        ws.cell(row=rr, column=2, value=f'=COUNTIFS({rng("employees")},A{rr},{rng("category")},"Transport")')
        ws.cell(row=rr, column=3, value=f'=COUNTIFS({rng("employees")},A{rr},{rng("category")},"Truck Tyre Reseller")')
        ws.cell(row=rr, column=4, value=f"=B{rr}+C{rr}")

    # 4. areas
    r3 = r2 + 8
    ws.cell(row=r3, column=1, value="Leads by area").font = Font(name="Arial", bold=True, size=12, color=ORANGE)
    header(r3 + 1, ["Area", "Region", "Transport", "Tyre Resellers", "Total"])
    areas = sorted({(r["region"], r["area"]) for r in rows if r["area"]},
                   key=lambda t: (REGIONS.index(t[0]), t[1]))
    for i, (reg, area) in enumerate(areas):
        rr = r3 + 2 + i
        ws.cell(row=rr, column=1, value=area); ws.cell(row=rr, column=2, value=reg)
        ws.cell(row=rr, column=3, value=f'=COUNTIFS({rng("area")},A{rr},{rng("region")},B{rr},{rng("category")},"Transport")')
        ws.cell(row=rr, column=4, value=f'=COUNTIFS({rng("area")},A{rr},{rng("region")},B{rr},{rng("category")},"Truck Tyre Reseller")')
        ws.cell(row=rr, column=5, value=f"=C{rr}+D{rr}")

    for row in ws.iter_rows(min_row=4):
        for x in row:
            if x.font is None or not x.font.bold:
                x.font = Font(name="Arial", size=10)
            if x.column > 1 and isinstance(x.value, str) and x.value.startswith("="):
                x.alignment = Alignment(horizontal="center")

    notes = [
        "How to read this workbook",
        "• All Leads = every company; Transport and Tyre Resellers tabs are the same rows split by category.",
        "• Region: Metro = Greater Sydney; N NSW = Central Coast, Hunter, North Coast, New England, North West;",
        "  W NSW = Blue Mountains/Lithgow, Central West, Orana, Far West; S NSW = Illawarra to the Murray.",
        "• Potential (Small/Medium/Large) and Employees are ESTIMATES. The 'Size basis' column says what each",
        "  estimate rests on (LinkedIn band, fleet stated on site, number of depots). Treat as a guide, not fact.",
        "• Phones and emails were only recorded where they appeared on a public page; blanks mean none was found.",
        "• Priority: A = medium/large with phone and email; B = most contactable; C = needs more digging.",
        "• Status column has a dropdown — use it to track calls. Summary counts update when you edit rows.",
        "• Chain branches (Tyrepower, Bridgestone etc.) are listed per town; head-office deals may cover several.",
    ]
    for i, t in enumerate(notes):
        x = ws.cell(row=4 + i, column=8, value=t)
        x.font = Font(name="Arial", size=10, bold=i == 0, color=ORANGE if i == 0 else "333333")


def build_xlsx(rows, path):
    wb = Workbook()
    summary_sheet(wb, rows)
    lead_sheet(wb, "All Leads", rows, INK)
    lead_sheet(wb, "Transport", [r for r in rows if r["category"] == "Transport"], "4A90A4")
    lead_sheet(wb, "Tyre Resellers", [r for r in rows if r["category"] == "Truck Tyre Reseller"], ORANGE)
    wb.save(path)


# ---------------------------------------------------------------- HTML
def build_html(rows, path):
    tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    slim = [{k: r[k] for k in ["id", "name", "category", "subtype", "website", "description", "region",
                               "area", "city", "address", "phones", "emails", "contact_page",
                               "other_contacts", "size", "employees", "fleet", "size_basis",
                               "source", "reach", "priority"]} for r in rows]
    data = json.dumps(slim, ensure_ascii=False).replace("</", "<\\/")
    out = tpl.replace("/*__DATA__*/[]", data).replace("__DATE__", TODAY)
    open(path, "w", encoding="utf-8").write(out)


if __name__ == "__main__":
    rows = load()
    json.dump(rows, open(os.path.join(HERE, "leads.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    build_xlsx(rows, os.path.join(HERE, "Spartan-Tyres-NSW-Leads.xlsx"))
    # The browsable view is now the React "Leads" page in the website admin
    # (npm run import:leads loads leads.json into the database), so the
    # standalone HTML page is no longer generated. build_html is kept for
    # reference only.
    from collections import Counter
    print("TOTAL", len(rows))
    print(Counter((r["category"], r["region"]) for r in rows))
    print("phone", sum(bool(r["phones"]) for r in rows), "email", sum(bool(r["emails"]) for r in rows))
