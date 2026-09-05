import os
import time
import requests
from pinecone import Pinecone, ServerlessSpec

# Disable symlinks warning from huggingface_hub on Windows
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Constants
INDEX_NAME = "digifeed-rag"
MODEL_NAME = "BAAI/bge-small-en-v1.5"
HF_FALLBACK_MODELS = [
    "BAAI/bge-small-en-v1.5",
    "sentence-transformers/all-MiniLM-L6-v2"
]

# Global cache for local embedding model
_LOCAL_MODEL = None

def get_local_embeddings(texts):
    """
    Generate 384-dimensional embeddings locally using fastembed ONNX runtime (ultra-fast, 0 API calls).
    """
    global _LOCAL_MODEL
    try:
        from fastembed import TextEmbedding
        if _LOCAL_MODEL is None:
            print(f"[FastEmbed] Loading local ONNX embedding model '{MODEL_NAME}'...")
            _LOCAL_MODEL = TextEmbedding(model_name=MODEL_NAME)
        
        embeddings = list(_LOCAL_MODEL.embed(texts))
        return [list(map(float, vec)) for vec in embeddings]
    except Exception as e:
        print(f"[FastEmbed] Local embedding failed/not available: {e}")
        return None

def get_hf_embeddings(texts, hf_token=None, retries=3):
    """
    Get 384-dimensional embeddings using Hugging Face Inference API as fallback.
    """
    headers = {
        "x-use-pipeline": "feature-extraction"
    }
    if hf_token:
        headers["Authorization"] = f"Bearer {hf_token}"

    last_error = None
    for model in HF_FALLBACK_MODELS:
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
                        timeout=45
                    )
                    if response.status_code == 200:
                        res_json = response.json()
                        # Handle 3D token array pooling if returned
                        if isinstance(res_json, list) and len(res_json) > 0 and isinstance(res_json[0], list) and len(res_json[0]) > 0 and isinstance(res_json[0][0], list):
                            pooled = []
                            for item in res_json:
                                dim = len(item[0])
                                vec = [sum(token[k] for token in item) / len(item) for k in range(dim)]
                                pooled.append(vec)
                            return pooled
                        elif isinstance(res_json, list) and len(res_json) > 0 and isinstance(res_json[0], (int, float)):
                            return [res_json]
                        return res_json
                    elif response.status_code == 503:
                        time.sleep(5 * (attempt + 1))
                    elif response.status_code == 429:
                        time.sleep(10 * (attempt + 1))
                    else:
                        last_error = f"Status {response.status_code}: {response.text[:200]}"
                        time.sleep(2)
                except Exception as e:
                    last_error = str(e)
                    time.sleep(2 * (attempt + 1))

    raise Exception(f"Failed to get embeddings from Hugging Face API fallback. Last error: {last_error}")

def generate_embeddings(texts, hf_token=None):
    """
    Primary: Fast local ONNX engine.
    Secondary: Hugging Face Inference API.
    """
    # Try Tier 1: Local ONNX
    embeddings = get_local_embeddings(texts)
    if embeddings is not None and len(embeddings) == len(texts):
        return embeddings

    # Try Tier 2: Hugging Face API
    print("[RAG] Falling back to Hugging Face Inference API...")
    return get_hf_embeddings(texts, hf_token=hf_token)

def init_pinecone(pinecone_api_key):
    """
    Initialize Pinecone and create index if it doesn't exist.
    """
    pc = Pinecone(api_key=pinecone_api_key)
    
    existing_indexes = [index_info["name"] for index_info in pc.list_indexes()]
    if INDEX_NAME not in existing_indexes:
        print(f"Creating Pinecone index '{INDEX_NAME}'...")
        pc.create_index(
            name=INDEX_NAME,
            dimension=384,
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1"
            )
        )
        while not pc.describe_index(INDEX_NAME).status['ready']:
            time.sleep(1)
            
    return pc.Index(INDEX_NAME)

def prune_index_if_needed(index, max_vectors=40000):
    """
    Check index stats.
    """
    try:
        stats = index.describe_index_stats()
        total_vectors = stats.get('total_vector_count', 0)
        print(f"Current vectors in Pinecone index '{INDEX_NAME}': {total_vectors}")
    except Exception as e:
        print(f"Index stats check: {e}")

def upsert_articles(articles, pinecone_api_key, hf_token=None, batch_size=40):
    """
    Embed and upsert articles into Pinecone in safe batches.
    """
    if not articles:
        return

    print(f"Initializing Pinecone and preparing {len(articles)} articles for upsert...")
    index = init_pinecone(pinecone_api_key)
    prune_index_if_needed(index)
    
    total_batches = (len(articles) + batch_size - 1) // batch_size
    
    for i in range(0, len(articles), batch_size):
        batch = articles[i:i+batch_size]
        batch_num = (i // batch_size) + 1
        
        texts = []
        for item in batch:
            title = item.get('title', '')
            cat = item.get('category') or item.get('category_tag') or 'Unknown'
            content = item.get('content') or item.get('plain_summary') or item.get('deep_lore') or ''
            date = item.get('date') or item.get('collected_date') or item.get('published_fmt') or ''
            # Enhanced rich prefix for high-precision semantic & temporal matching
            snippet = f"Title: {title}\nDate: {date}\nCategory: {cat}\nContent: {content[:1200]}"
            texts.append(snippet)
        
        print(f"Generating embeddings for batch {batch_num}/{total_batches} ({len(batch)} items)...")
        embeddings = generate_embeddings(texts, hf_token=hf_token)
        
        vectors = []
        for j, item in enumerate(batch):
            title = item.get('title', '')
            cat = item.get('category') or item.get('category_tag') or ''
            content = item.get('content') or item.get('plain_summary') or item.get('deep_lore') or ''
            date = item.get('date') or item.get('collected_date') or item.get('published_fmt') or ''
            link = item.get('link') or item.get('url') or ''
            
            metadata = {
                "title": title[:500],
                "date": date,
                "category": cat,
                "link": link[:500],
                "content": content[:2000]
            }
            vectors.append((item['id'], embeddings[j], metadata))
            
        print(f"Upserting batch {batch_num}/{total_batches} to Pinecone...")
        index.upsert(vectors=vectors)
        time.sleep(0.3)
        
    print(f"[SUCCESS] Upserted {len(articles)} items into Pinecone.")

if __name__ == "__main__":
    pc_key = os.environ.get("PINECONE_API_KEY")
    hf_key = os.environ.get("HF_TOKEN")
    if pc_key:
        print("Pinecone API key detected. Testing local embedding...")
        test_vecs = generate_embeddings(["Test intelligence query"])
        print(f"Success. Vector dimension: {len(test_vecs[0])}")
    else:
        print("Run with PINECONE_API_KEY to execute ingestion.")
