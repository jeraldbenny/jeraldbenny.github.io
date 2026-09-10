import os
import sys
import json
import html
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

def escape_html(text):
    if not text:
        return ""
    return html.escape(str(text))

def send_telegram_message(token, chat_id, text_html):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text_html,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={"Content-Type": "application/json", "User-Agent": "DigiFeed-Telegram-Bot/1.0"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

def build_daily_briefing(base_dir):
    data_path = os.path.join(base_dir, "digifeed", "data.json")
    status_path = os.path.join(base_dir, "digifeed", "digibot_status.json")
    ops_path = os.path.join(base_dir, "ops", "ops_status.json")

    # 1. Load DigiBot status
    bot_status = {}
    if os.path.exists(status_path):
        try:
            with open(status_path, "r", encoding="utf-8") as f:
                bot_status = json.load(f)
        except Exception:
            pass

    # 2. Load Ops status
    ops_status = {}
    if os.path.exists(ops_path):
        try:
            with open(ops_path, "r", encoding="utf-8") as f:
                ops_status = json.load(f)
        except Exception:
            pass

    # 3. Load Articles
    articles = []
    if os.path.exists(data_path):
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                articles = json.load(f).get("articles", [])
        except Exception:
            pass

    # Timestamp & Status
    IST = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(IST).strftime("%d %b %Y, %H:%M IST")
    now_utc = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")

    last_sync_ist = bot_status.get("last_sync") or ops_status.get("last_update") or now_ist
    last_sync_utc = bot_status.get("last_sync_utc") or now_utc
    status_str = bot_status.get("status", "ONLINE / SYNCED")
    vectors_cnt = bot_status.get("total_vectors", "1,000+")
    active_cnt = bot_status.get("active_dispatches", len(articles))

    # Error check
    errors = []
    if bot_status.get("errors"):
        errors.extend(bot_status.get("errors"))
    if ops_status.get("errors"):
        errors.extend(ops_status.get("errors"))
    
    if errors:
        health_status = f"⚠️ {len(errors)} Potential Issue(s) Noted"
    else:
        health_status = "✅ 0 Errors Detected (All Systems Healthy)"

    # Filter DFIR articles
    dfir_articles = []
    forensic_articles = []

    for a in articles:
        cat = a.get("category_tag") or a.get("category") or ""
        title = a.get("title", "").strip()
        link = a.get("link") or a.get("url") or "https://jeraldbenny.qd.je/digifeed/"
        summary = a.get("plain_summary") or a.get("deep_lore") or ""
        summary = " ".join(summary.split())[:150]
        if summary and not summary.endswith("."):
            summary += "..."

        if not title:
            continue

        raw_date = a.get("published_fmt") or a.get("collected_date") or ""
        date_short = raw_date.replace("2026", "26").replace("2025", "25").replace("2024", "24")

        item = {"title": title, "link": link, "summary": summary, "date": date_short}

        if cat in ["DFIR Articles", "Malware Intelligence", "CVE & Vulnerabilities", "IOC Feed"]:
            if len(dfir_articles) < 3:
                dfir_articles.append(item)
        elif cat in ["Forensics", "Research Papers", "GitHub Releases"]:
            if len(forensic_articles) < 3:
                forensic_articles.append(item)
        else:
            if len(dfir_articles) < 3:
                dfir_articles.append(item)

    if not forensic_articles and len(articles) > 3:
        for a in articles[3:6]:
            raw_d = a.get("published_fmt") or a.get("collected_date") or ""
            d_s = raw_d.replace("2026", "26").replace("2025", "25").replace("2024", "24")
            forensic_articles.append({
                "title": a.get("title", "Forensic Article"),
                "link": a.get("link", "https://jeraldbenny.qd.je/digifeed/"),
                "summary": " ".join((a.get("plain_summary") or "").split())[:150],
                "date": d_s
            })

    # Build formatted HTML
    msg = []
    msg.append("🤖 <b>DIGIFEED & DIGIBOT DAILY BRIEFING</b>")
    msg.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    msg.append("🕒 <b>When you got latest updated?</b>")
    msg.append(f"• <b>IST:</b> <code>{escape_html(last_sync_ist)}</code>")
    msg.append(f"• <b>UTC:</b> <code>{escape_html(last_sync_utc)}</code>")
    msg.append(f"• <b>Status:</b> <b>{escape_html(status_str)}</b>")
    msg.append(f"• <b>Vector Store:</b> <code>{vectors_cnt}</code> Pinecone vectors (384-D)")
    msg.append(f"• <b>Active Dispatches:</b> <code>{active_cnt}</code> articles parsed")
    msg.append(f"• <b>Health Check:</b> {escape_html(health_status)}")
    msg.append("")

    msg.append("🛡️ <b>TOP DFIR NEWS HEADLINES:</b>")
    if dfir_articles:
        for item in dfir_articles:
            t_escaped = escape_html(item["title"])
            l_escaped = escape_html(item["link"])
            s_escaped = escape_html(item["summary"])
            d_escaped = escape_html(item.get("date", ""))
            if d_escaped:
                msg.append(f"• <b>{d_escaped}</b> — <a href=\"{l_escaped}\"><b>{t_escaped}</b></a>")
            else:
                msg.append(f"• <a href=\"{l_escaped}\"><b>{t_escaped}</b></a>")
            if s_escaped:
                msg.append(f"  <i>{s_escaped}</i>")
    else:
        msg.append("• <i>No critical DFIR events reported in this cycle.</i>")
    msg.append("")

    msg.append("🔬 <b>TOP FORENSIC NEWS HEADLINES:</b>")
    if forensic_articles:
        for item in forensic_articles:
            t_escaped = escape_html(item["title"])
            l_escaped = escape_html(item["link"])
            s_escaped = escape_html(item["summary"])
            d_escaped = escape_html(item.get("date", ""))
            if d_escaped:
                msg.append(f"• <b>{d_escaped}</b> — <a href=\"{l_escaped}\"><b>{t_escaped}</b></a>")
            else:
                msg.append(f"• <a href=\"{l_escaped}\"><b>{t_escaped}</b></a>")
            if s_escaped:
                msg.append(f"  <i>{s_escaped}</i>")
    else:
        msg.append("• <i>Standard forensic tools and research monitoring active.</i>")

    msg.append("")
    msg.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    msg.append("🔗 <a href=\"https://jeraldbenny.qd.je/digifeed/\">Open DigiFeed</a> | <a href=\"https://jeraldbenny.qd.je/ops/\">Ops Dashboard</a> | <a href=\"https://jeraldbenny.qd.je/digilab/\">DigiLab</a>")

    return "\n".join(msg)

def build_error_alert(error_detail=""):
    IST = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(IST).strftime("%d %b %Y, %H:%M IST")

    msg = []
    msg.append("🚨 <b>DIGIFEED / DIGIBOT PIPELINE ALERT</b>")
    msg.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    msg.append(f"⚠️ <b>Incident Timestamp:</b> <code>{escape_html(now_ist)}</code>")
    msg.append("<b>Status:</b> Automated sync or ingestion encountered an error.")
    if error_detail:
        msg.append(f"<b>Details:</b>\n<code>{escape_html(error_detail[:500])}</code>")
    else:
        msg.append("<b>Details:</b> GitHub Actions workflow step failed during execution.")
    msg.append("")
    msg.append("🔗 <a href=\"https://github.com/jeraldbenny/jeraldbenny.github.io/actions\">View GitHub Actions Logs</a> | <a href=\"https://jeraldbenny.qd.je/ops/\">Open Ops</a>")
    return "\n".join(msg)

def main():
    parser = argparse.ArgumentParser(description="Send DigiFeed / DigiBot notifications via Telegram")
    parser.add_argument("--mode", choices=["success", "error", "test"], default="success", help="Notification mode")
    parser.add_argument("--error-msg", default="", help="Error message if mode is error")
    args = parser.parse_args()

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        print("[SKIP] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in environment.")
        return 0

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if args.mode == "success":
        message = build_daily_briefing(base_dir)
    elif args.mode == "error":
        message = build_error_alert(args.error_msg)
    elif args.mode == "test":
        message = "🤖 <b>DigiIntel Bot Connection Test</b>\n\nYour private Telegram notification system is successfully active and ready for daily morning briefings."
    else:
        message = "Unknown notification mode."

    try:
        res = send_telegram_message(token, chat_id, message)
        if res.get("ok"):
            print(f"[SUCCESS] Telegram notification delivered! Message ID: {res.get('result', {}).get('message_id')}")
            return 0
        else:
            print(f"[ERROR] Telegram API returned: {res}")
            return 1
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"[ERROR] Telegram HTTP {e.code}: {err_body}")
        return 0
    except Exception as e:
        print(f"[ERROR] Failed to send Telegram message: {e}")
        return 0

if __name__ == "__main__":
    sys.exit(main())
