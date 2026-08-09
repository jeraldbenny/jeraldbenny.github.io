import json
from collections import Counter

d = json.load(open("digifeed/archive.json", encoding="utf-8"))
arts = d["articles"]
date_counts = Counter(a.get("published_fmt", "Unknown") for a in arts)

print(f"Total articles: {len(arts)}")
print(f"Unique dates: {len(date_counts)}")
print(f"\nArticles per date (sorted):")
for dt, cnt in sorted(date_counts.items(), reverse=True)[:30]:
    print(f"  {dt}: {cnt}")

# Check for suspicious images
img_types = Counter()
for a in arts:
    img = a.get("image", "")
    if "unsplash" in img:
        img_types["unsplash"] += 1
    elif img.startswith("images/") and "_" in img:
        img_types["variant_local"] += 1
    elif img.startswith("images/"):
        img_types["base_local"] += 1
    elif img.startswith("http"):
        img_types["external_real"] += 1
    else:
        img_types["other"] += 1

print(f"\nImage types:")
for it, cnt in img_types.most_common():
    print(f"  {it}: {cnt}")

# Check today's articles in data.json
d2 = json.load(open("digifeed/data.json", encoding="utf-8"))
today_arts = d2["articles"]
print(f"\n--- data.json (today's display) ---")
print(f"Total today: {len(today_arts)}")
cat_counts = Counter(a.get("category_tag", "?") for a in today_arts)
for cat, cnt in cat_counts.most_common():
    print(f"  {cat}: {cnt}")

# Check image types in data.json
img_types2 = Counter()
for a in today_arts:
    img = a.get("image", "")
    if "unsplash" in img:
        img_types2["unsplash"] += 1
    elif img.startswith("images/") and "_" in img:
        img_types2["variant_local"] += 1
    elif img.startswith("images/"):
        img_types2["base_local"] += 1
    elif img.startswith("http"):
        img_types2["external_real"] += 1
    else:
        img_types2["other"] += 1

print(f"\nToday's image types:")
for it, cnt in img_types2.most_common():
    print(f"  {it}: {cnt}")
