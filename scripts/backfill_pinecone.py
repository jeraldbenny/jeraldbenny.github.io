import json
import os
import sys

# Ensure scripts directory is in path
if os.path.dirname(os.path.abspath(__file__)) not in sys.path:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import rag_engine

def main():
    pc_key = os.environ.get("PINECONE_API_KEY")
    hf_key = os.environ.get("HF_TOKEN")
    
    if not pc_key or not hf_key:
        print("ERROR: Missing API keys!")
        print("Please set your environment variables before running:")
        print("  $env:PINECONE_API_KEY=\"your_pinecone_key\"")
        print("  $env:HF_TOKEN=\"your_hf_key\"")
        sys.exit(1)

    archive_path = os.path.join(os.path.dirname(__file__), '..', 'digifeed', 'archive.json')
    if not os.path.exists(archive_path):
        print(f"ERROR: Could not find archive file at {archive_path}")
        sys.exit(1)

    print("Loading archive data...")
    try:
        with open(archive_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            articles = data.get("articles", [])
    except Exception as e:
        print(f"Failed to read archive: {e}")
        sys.exit(1)

    if not articles:
        print("Archive is empty!")
        return

    print(f"Found {len(articles)} articles in archive. Starting Pinecone backfill...")
    
    # Run the upsert logic from rag_engine
    # It batches in chunks of 100, which requires 7-8 requests (Safe for HF free tier limits)
    try:
        rag_engine.upsert_articles(articles, pc_key, hf_key)
        print("\n[SUCCESS] Backfill complete! The Pinecone database is now populated.")
    except Exception as e:
        print(f"\n[ERROR] Backfill failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
