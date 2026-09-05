import os
import sys
import json
from datetime import datetime, timezone

# Ensure scripts directory is in path
scripts_dir = os.path.dirname(os.path.abspath(__file__))
if scripts_dir not in sys.path:
    sys.path.append(scripts_dir)

import rag_engine
from ingest_static import STATIC_KNOWLEDGE

def build_today_briefing(articles, current_date_str):
    """
    Construct rich dynamic briefing records for today's news and system status.
    Ensures DigiBot accurately answers queries about today's news, latest CVEs, and update dates.
    """
    top_stories = []
    cves = []
    threats = []
    tools = []
    headlines = []

    for a in articles:
        title = a.get("title", "").strip()
        cat = a.get("category_tag") or a.get("category") or ""
        summary = a.get("plain_summary") or a.get("deep_lore") or ""
        date_str = a.get("published_fmt") or current_date_str
        link = a.get("link") or a.get("url") or "https://jeraldbenny.github.io/digifeed/"
        source_name = a.get("source") or "DigiFeed"
        
        if not title:
            continue
            
        headline_entry = f"• [{date_str}] {title} (Source: [{source_name}]({link}))"
        headlines.append(headline_entry)
        
        detail_entry = f"• [{date_str}] {title}: {summary[:240]} (Reference: [{source_name}]({link}))"
        
        if "CVE" in cat or "Vulnerabilities" in cat or "CVE-" in title:
            cves.append(detail_entry)
        elif "Malware" in cat or "IOC" in cat or "Threat" in title or "Ransomware" in title:
            threats.append(detail_entry)
        elif "GitHub" in cat or "Release" in cat or "Tool" in cat:
            tools.append(detail_entry)
        else:
            if len(top_stories) < 6:
                top_stories.append(detail_entry)

    cves_text = "\n".join(cves[:5]) if cves else "• No critical zero-days reported today."
    threats_text = "\n".join(threats[:5]) if threats else "• Standard background threat monitoring active."
    tools_text = "\n".join(tools[:5]) if tools else "• No new tool releases today."
    top_stories_text = "\n".join(top_stories[:6]) if top_stories else "• Active daily monitoring of DFIR sources."
    headlines_text = "\n".join(headlines[:15])

    briefing_content = f"""TODAY'S CYBERSECURITY & FORENSICS INTELLIGENCE BRIEFING ({current_date_str}):
CURRENT DATE: {current_date_str}
LAST UPDATE STATUS: Fresh dispatches collected and synchronized for {current_date_str}.

TOP STORIES & FORENSICS HEADLINES TODAY:
{top_stories_text}

ACTIVE CVES & VULNERABILITIES DETECTED TODAY:
{cves_text}

THREAT INTELLIGENCE & MALWARE DISPATCHES:
{threats_text}

NEW TOOLS & ARTIFACT EXTRACTORS:
{tools_text}

RECENT HEADLINES SUMMARY:
{headlines_text}
"""

    status_content = f"""DIGIBOT SYSTEM INTELLIGENCE STATUS & CURRENT DATE:
- CURRENT DATE TODAY: {current_date_str}
- LAST SYNCHRONIZED DATE: {current_date_str}
- DATABASE STATUS: Active, fully updated with {len(articles)} fresh daily dispatches and 1000+ historical archives up to {current_date_str}.
- INTELLIGENCE SCOPE: Real-time digital forensics dispatches, CISA KEV alerts, NVD vulnerabilities, malware analysis, incident response methodologies, and open-source tool releases.
- QUERY ANCHORS: date, date?, what date, current date, today's date, when were you last updated, latest update date, status.
"""

    return [
        {
            "id": "system-today-briefing",
            "title": f"Today's News & Daily Intelligence Briefing ({current_date_str})",
            "category": "Daily Intelligence Briefing",
            "date": current_date_str,
            "plain_summary": f"Today's cybersecurity intelligence briefing for {current_date_str}. Top digital forensic news today, top forensic news of today, active CVEs, malware threats, and tool releases for {current_date_str}.",
            "content": briefing_content
        },
        {
            "id": "system-latest-status",
            "title": f"DigiBot Live Intelligence Status & Archive Synchronization ({current_date_str})",
            "category": "System Status",
            "date": current_date_str,
            "plain_summary": f"DigiBot live system status and current date: {current_date_str}. Database synchronized with fresh dispatches up to {current_date_str}.",
            "content": status_content
        }
    ]

def main():
    pc_key = os.environ.get('PINECONE_API_KEY')
    hf_key = os.environ.get('HF_TOKEN')
    
    if not pc_key:
        print('ERROR: Missing PINECONE_API_KEY.')
        sys.exit(1)

    base_dir = os.path.join(os.path.dirname(__file__), '..', 'digifeed')
    data_path = os.path.join(base_dir, 'data.json')
    archive_path = os.path.join(base_dir, 'archive.json')

    data_articles = []
    if os.path.exists(data_path):
        with open(data_path, 'r', encoding='utf-8') as f:
            data_articles = json.load(f).get('articles', [])

    archive_articles = []
    if os.path.exists(archive_path):
        with open(archive_path, 'r', encoding='utf-8') as f:
            archive_articles = json.load(f).get('articles', [])

    # Format current date string
    now = datetime.now(timezone.utc)
    current_date_str = now.strftime('%d %b %Y')

    # If data.json has articles, use the latest published date if available
    if data_articles:
        latest_pub = data_articles[0].get('published_fmt')
        if latest_pub:
            current_date_str = latest_pub

    print(f"Building intelligence context for date: {current_date_str}...")
    system_records = build_today_briefing(data_articles, current_date_str)

    # Aggregate all items with deduplication by ID
    all_items = {}
    
    # 1. Static knowledge
    for item in STATIC_KNOWLEDGE:
        all_items[item['id']] = item

    # 2. Historical archive dispatches
    for item in archive_articles:
        all_items[item['id']] = item

    # 3. Active today dispatches (overwrite older version if present)
    for item in data_articles:
        all_items[item['id']] = item

    # 4. System status & Today briefing records (highest priority)
    for item in system_records:
        all_items[item['id']] = item

    items_list = list(all_items.values())
    print(f"Total unique intelligence items to upsert: {len(items_list)} ({len(data_articles)} active dispatches, {len(archive_articles)} archive, {len(system_records)} system records, {len(STATIC_KNOWLEDGE)} static)...")

    rag_engine.upsert_articles(items_list, pc_key, hf_token=hf_key, batch_size=40)
    print(f"[SUCCESS] DigiBot RAG ingestion completed for {current_date_str}.")

    # Save DigiBot operational status for the Ops Dashboard
    bot_status_data = {
        "last_sync": now.strftime("%d %b %Y, %H:%M UTC"),
        "date_anchored": current_date_str,
        "status": "ONLINE / SYNCED",
        "index_name": "digifeed-rag",
        "total_vectors": len(items_list),
        "active_dispatches": len(data_articles),
        "archive_records": len(archive_articles),
        "system_records": len(system_records),
        "static_records": len(STATIC_KNOWLEDGE),
        "embedding_model": "BAAI/bge-small-en-v1.5",
        "dimension": 384,
        "embedding_engine": "FastEmbed ONNX Runtime",
        "worker_api": "https://jb-intel-bot-api.jeraldbenny04-c7a.workers.dev",
        "schedule": "Daily at 00:30 UTC"
    }
    bot_status_path = os.path.join(base_dir, 'digibot_status.json')
    try:
        with open(bot_status_path, 'w', encoding='utf-8') as f:
            json.dump(bot_status_data, f, indent=2, ensure_ascii=False)
        print(f"[Done] Saved DigiBot operational status to {bot_status_path}.")
    except Exception as e:
        print(f"Warning: Failed to write {bot_status_path}: {e}")

if __name__ == '__main__':
    main()
