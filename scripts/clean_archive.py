import json
from datetime import datetime, timezone

ARCHIVE_FILE = "digifeed/archive.json"

try:
    with open(ARCHIVE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    data = {"articles": []}

articles = data.get("articles", [])
cleaned_articles = []
today = datetime.now(timezone.utc).strftime("%d %b %Y")

for a in articles:
    # Only keep articles that have collected_date or were published today
    # (Since we just added collected_date, old ones won't have it, but we only want to keep today's to wipe out fakes)
    if a.get("collected_date") == today or a.get("published_fmt", "").startswith(today.split(" ")[0]):
        # actually, just let's check if the article is from the recent fetch or today.
        # But if the user wants only today's, we can just keep articles where published_fmt == today
        # Or better: keep articles from the current run (which are in data.json)
        pass

# Let's just load data.json and initialize archive with it.
try:
    with open("digifeed/data.json", "r", encoding="utf-8") as f:
        today_data = json.load(f)
    today_articles = today_data.get("articles", [])
except Exception:
    today_articles = []

# Now, we rewrite archive to only contain today's articles.
# Because the user said: "only existing date's data has to show, no need of fake entries over there... it has to work like each day each date and data has to add"
archive_output = {
    "last_updated": datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC"),
    "total": len(today_articles),
    "articles": today_articles
}

with open(ARCHIVE_FILE, "w", encoding="utf-8") as f:
    json.dump(archive_output, f, indent=2, ensure_ascii=False)

print(f"Cleaned archive.json. Total articles: {len(today_articles)}")
