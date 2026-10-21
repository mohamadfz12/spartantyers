"""Re-visit every existing lead's website to collect contact details it is missing.

Writes research/zz_enrich_contacts.json in the shape build.py treats as an
enrichment file: rows match an existing lead by category + name + website and
only ADD phones / emails / contact page — they never create new leads.

Usage: python tools/enrich_existing.py
"""
import json, os, sys, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from scrape import scrape  # noqa: E402

leads = json.load(open(os.path.join(ROOT, "leads.json"), encoding="utf-8"))
todo = [l for l in leads if l.get("website") and (not l["emails"] or len(l["phones"]) < 2)]
print(f"{len(todo)} of {len(leads)} leads have a website and are missing an email or a second phone")


def work(lead):
    r = scrape(lead["website"])
    if not r["ok"]:
        return None
    new_phones = [p for p in r["phones"] if p not in lead["phones"]]
    new_emails = [e for e in r["emails"] if e not in lead["emails"]]
    if not new_phones and not new_emails and (lead.get("contact_page") or not r["contact_page"]):
        return None
    return {
        "name": lead["name"], "category": lead["category"], "region": lead["region"],
        "area": lead["area"], "city": lead["city"], "website": lead["website"],
        "phones": lead["phones"] + new_phones, "emails": lead["emails"] + new_emails,
        "contact_page": lead.get("contact_page") or r["contact_page"],
        "_new": {"phones": new_phones, "emails": new_emails},
    }


out, done = [], 0
with cf.ThreadPoolExecutor(max_workers=8) as pool:
    for res in pool.map(work, todo):
        done += 1
        if res:
            out.append(res)
        if done % 50 == 0:
            print(f"  {done}/{len(todo)} visited, {len(out)} improved", flush=True)

path = os.path.join(ROOT, "research", "zz_enrich_contacts.json")
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nimproved {len(out)} leads: "
      f"+{sum(len(r['_new']['emails']) for r in out)} emails, "
      f"+{sum(len(r['_new']['phones']) for r in out)} phones "
      f"({sum(1 for r in out if r['_new']['emails'] and not [e for e in r['emails'] if e not in r['_new']['emails']])} leads gained their first email)")
print("written", path)
