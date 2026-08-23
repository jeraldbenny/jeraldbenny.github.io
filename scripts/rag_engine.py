import os
import time
import requests
from pinecone import Pinecone, ServerlessSpec

# Constants
INDEX_NAME = "digifeed-rag"
HF_EMBEDDING_MODELS = [
    "BAAI/bge-small-en-v1.5",
    "sentence-transformers/all-MiniLM-L6-v2"
]

def get_hf_embeddings(texts, hf_token, retries=4):
    """
    Get 384-dimensional embeddings using Hugging Face Inference API with fallback models & retry logic.
    """
    headers = {
        "Authorization": f"Bearer {hf_token}",
        "x-use-pipeline": "feature-extraction"
    }
    last_error = None

    for model in HF_EMBEDDING_MODELS:
        urls = [
            f"https://router.huggingface.co/hf-inference/models/{model}",
            f"https://api-inference.huggingface.co/models/{model}"
        ]
        for api_url in urls:
            for attempt in range(retries):
                try:
                    response = requests.post(
                        api_url,
                        headers=headers,
                        json={"inputs": texts, "options": {"wait_for_model": True, "use_cache": True}},
                        timeout=60
                    )
                    if response.status_code == 200:
                        res_json = response.json()
                        # Handle 3D token array pooling if returned by token-level feature extraction
                        if isinstance(res_json, list) and len(res_json) > 0 and isinstance(res_json[0], list) and len(res_json[0]) > 0 and isinstance(res_json[0][0], list):
                            pooled = []
                            for item in res_json:
                                dim = len(item[0])
                                vec = [sum(token[k] for token in item) / len(item) for k in range(dim)]
                                pooled.append(vec)
                            return pooled
                        # Handle standard 2D list of vectors
                        elif isinstance(res_json, list) and len(res_json) > 0 and isinstance(res_json[0], (int, float)):
                            # Single vector returned
                            return [res_json]
                        return res_json
                    elif response.status_code == 503:
                        wait_sec = 10 * (attempt + 1)
                        print(f"HF API Model loading ({model}), waiting {wait_sec}s...")
                        time.sleep(wait_sec)
                    elif response.status_code == 429:
                        wait_sec = 15 * (attempt + 1)
                        print(f"HF Rate limit reached, cooling down {wait_sec}s...")
                        time.sleep(wait_sec)
                    else:
                        print(f"HF API ({api_url}) Status {response.status_code}: {response.text[:200]}")
                        last_error = f"Status {response.status_code}: {response.text[:200]}"
                        time.sleep(3)
                except Exception as e:
                    print(f"Connection attempt {attempt + 1} failed for {api_url}: {e}")
                    last_error = str(e)
                    time.sleep(3 * (attempt + 1))

    raise Exception(f"Failed to get embeddings from Hugging Face API. Last error: {last_error}")

def init_pinecone(pinecone_api_key):
    """
    Initialize Pinecone and create the index if it doesn't exist.
    """
    pc = Pinecone(api_key=pinecone_api_key)
    
    existing_indexes = [index_info["name"] for index_info in pc.list_indexes()]
    if INDEX_NAME not in existing_indexes:
        print(f"Creating Pinecone index '{INDEX_NAME}'...")
        pc.create_index(
            name=INDEX_NAME,
            dimension=384, # dimension for bge-small-en-v1.5 and all-MiniLM-L6-v2
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1"
            )
        )
        # Wait for index to be ready
        while not pc.describe_index(INDEX_NAME).status['ready']:
            time.sleep(1)
            
    return pc.Index(INDEX_NAME)

def prune_index_if_needed(index, max_vectors=40000):
    """
    Keep the index under max_vectors.
    """
    try:
        stats = index.describe_index_stats()
        total_vectors = stats.get('total_vector_count', 0)
        print(f"Current vectors in Pinecone: {total_vectors}")
        if total_vectors > max_vectors:
            print("Approaching max limit, pruning would be necessary in a real production environment with full state.")
    except Exception as e:
        print(f"Index stats check: {e}")

def upsert_articles(articles, pinecone_api_key, hf_token):
    """
    Embed and upsert articles into Pinecone in safe batches.
    articles format: [{"id": "...", "title": "...", "content": "...", "date": "...", "category": "..."}]
    """
    if not articles:
        return

    print(f"Initializing Pinecone and upserting {len(articles)} articles...")
    index = init_pinecone(pinecone_api_key)
    
    # Prune check
    prune_index_if_needed(index)
    
    # Use smaller batch size (25) to avoid HF API timeout and payload limits
    batch_size = 25
    total_batches = (len(articles) + batch_size - 1) // batch_size
    
    for i in range(0, len(articles), batch_size):
        batch = articles[i:i+batch_size]
        batch_num = (i // batch_size) + 1
        
        # Prepare text for embedding
        texts = []
        for item in batch:
            title = item.get('title', '')
            cat = item.get('category') or item.get('category_tag') or 'Unknown'
            content = item.get('content') or item.get('plain_summary') or item.get('deep_lore') or ''
            # Truncate text snippet to 1000 chars for optimal embedding performance
            snippet = f"Title: {title}\nCategory: {cat}\nContent: {content[:1000]}"
            texts.append(snippet)
        
        print(f"Generating embeddings for batch {batch_num}/{total_batches} ({len(batch)} items)...")
        embeddings = get_hf_embeddings(texts, hf_token)
        
        # Prepare vectors for pinecone: (id, values, metadata)
        vectors = []
        for j, item in enumerate(batch):
            title = item.get('title', '')
            cat = item.get('category') or item.get('category_tag') or ''
            content = item.get('content') or item.get('plain_summary') or item.get('deep_lore') or ''
            date = item.get('date') or item.get('collected_date') or item.get('published_fmt') or ''
            
            metadata = {
                "title": title[:500],
                "date": date,
                "category": cat,
                # Truncate content to 2000 chars to comfortably fit inside Pinecone metadata limit (40KB)
                "content": content[:2000]
            }
            vectors.append((item['id'], embeddings[j], metadata))
            
        print(f"Upserting batch {batch_num}/{total_batches} to Pinecone...")
        index.upsert(vectors=vectors)
        
        # Brief pause between batches to be gentle on free-tier APIs
        time.sleep(1)
        
    print("[SUCCESS] Upsert complete.")

if __name__ == "__main__":
    pc_key = os.environ.get("PINECONE_API_KEY")
    hf_key = os.environ.get("HF_TOKEN")
    if pc_key and hf_key:
        print("Ready for ingestion.")
    else:
        print("Missing API keys for Pinecone or Hugging Face.")
