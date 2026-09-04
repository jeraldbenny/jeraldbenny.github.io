import os
import sys
import json

# Ensure scripts directory is in path
if os.path.dirname(os.path.abspath(__file__)) not in sys.path:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import rag_engine
from ingest_static import STATIC_KNOWLEDGE

def main():
    pc_key = os.environ.get('PINECONE_API_KEY')
    hf_key = os.environ.get('HF_TOKEN')
    
    if not pc_key or not hf_key:
        print('ERROR: Missing PINECONE_API_KEY or HF_TOKEN.')
        sys.exit(1)

    data_path = os.path.join(os.path.dirname(__file__), '..', 'digifeed', 'data.json')
    if not os.path.exists(data_path):
        print(f'Warning: {data_path} not found.')
        data_articles = []
    else:
        with open(data_path, 'r', encoding='utf-8') as f:
            data_articles = json.load(f).get('articles', [])

    print(f'Ingesting static knowledge ({len(STATIC_KNOWLEDGE)} items)...')
    rag_engine.upsert_articles(STATIC_KNOWLEDGE, pc_key, hf_key)

    if data_articles:
        print(f'Ingesting active dispatches from data.json ({len(data_articles)} items)...')
        rag_engine.upsert_articles(data_articles, pc_key, hf_key)

    print('[SUCCESS] Daily DigiFeed RAG ingestion completed.')

if __name__ == '__main__':
    main()
