# DigiFeed Project Documentation

## Overview
DigiFeed is an automated daily digital forensics and cybersecurity news digest. It automatically pulls articles, vulnerabilities (CVEs), malware threat intelligence, indicators of compromise (IOCs), and new GitHub tools from multiple predefined sources, processes them, normalizes categories, generates an interactive and responsive web layout, and archives historical data. 

## Core Architecture

### 1. Data Collection (`fetch_news.py`)
This script acts as the backend engine for DigiFeed. 
- **Sources:** It parses RSS feeds from prominent DFIR/cybersecurity websites (e.g., The Hacker News, BleepingComputer, SANS Internet Storm Center).
- **APIs:** It fetches active data from ThreatFox (IOCs), URLhaus (Malware URLs), CISA KEV (Known Exploited Vulnerabilities), and GitHub (tool releases).
- **Processing:** 
  - Extracts properties like title, link, summary, publication date, and cover image.
  - Normalizes categories into a defined set (e.g., DFIR Articles, IOC Feed, Malware Intelligence, GitHub Releases).
  - Handles image fallbacks: if an article lacks a cover image or uses an Unsplash placeholder, a category-specific default image is dynamically assigned (rotating 5 variants per category based on article ID).
  - Deduplicates articles by title (preventing double entries intraday and across past runs).
  - Calculates a `forensic_score` based on keyword frequency to prioritize more relevant articles.
  - Detects semantic similarity between articles to build a "SIMILAR DISPATCHES" cross-reference list.
  - Saves the structured data into `digifeed/data.json`, `digifeed/tools_data.json` (for tools), and `digifeed/archive.json` (for historical preservation).

### 2. Hub Generation (`generate_hub.py`)
This script creates the static HTML dashboard used by the frontend.
- **Template Injection:** Reads `data.json` and `tools_data.json` and injects them into a pre-designed Cyberpunk/Terminal-styled HTML template.
- **Components:**
  - **Hero & Daily Briefing:** Shows total articles, category breakdowns, and a dynamic pie chart canvas.
  - **Filter Nav:** Buttons to filter the feed by categories ("ALL", "DFIR ARTICLES", etc.).
  - **Article Cards:** Renders the main news stream. If a category receives fewer than 5 updates, a compact "SLOW NEWS DAY" banner allows the user to easily jump to the archive for that category.
  - **Tool Tracker Panel:** A dedicated grid logging software updates and new releases in the DFIR tool space.
  - **Archive Explorer:** A file-tree styled pane for navigating historical daily data, containing its own search and summary statistics.
- **Output:** Generates `digifeed/index.html` and `ops/index.html`.

### 3. Archive System
The archive collects the daily runs. It groups previous dispatches by month and day into a static explorer UI.
- It is generated strictly from what was successfully processed and deduped during each fetch run.
- Entries are saved to `digifeed/archive.json`.
- The archive panel displays its own localized statistics (Total Articles, Monitored Days, Months Covered) and replaces the main daily briefing panel when activated.

## Deployment & Operation
To fully update and deploy the site:
1. Run `python scripts/fetch_news.py` to pull fresh data and process images.
2. Run `python scripts/generate_hub.py` to build the new HTML.
3. Serve the folder using any standard web server (e.g., `python -m http.server 8000`).

## Aesthetics & Design
- **Theme:** Dark mode, cyberpunk, retro-terminal styling.
- **Fonts:** "Inter" for main text readability, "Press Start 2P" and "VT323" for data metrics and terminal components.
- **Animations:** Custom canvas-based Matrix rain effect in the hero section, glowing CSS borders, and animated pie charts.
- **Responsiveness:** Auto-scales from a rigid 4-column layout down to 2-columns on mobile interfaces.
