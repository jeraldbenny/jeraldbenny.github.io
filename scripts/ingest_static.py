import os
import rag_engine

STATIC_KNOWLEDGE = [
    {
        "id": "static-about-jerald",
        "title": "About Jerald Benny",
        "category": "Biography",
        "content": "Jerald Benny is a digital forensics & cybersecurity analyst. He built this platform to curate and analyze the latest articles, research papers, threats, and tools in the DFIR (Digital Forensics and Incident Response) space.",
        "date": "2026-07-20"
    },
    {
        "id": "static-chatbot-purpose",
        "title": "JB:INTEL-BOT Purpose",
        "category": "System",
        "content": "JB:INTEL-BOT is an AI assistant embedded within the page. It's database containing thousands of curated digital forensics articles, IOCs, and malware intelligence reports. It is designed to answer questions about these articles and digital forensics in general.",
        "date": "2026-07-20"
    },
    {
        "id": "static-forensics-basics",
        "title": "Digital Forensics Basics",
        "category": "Forensics",
        "content": "Digital Forensics is the field of recovering and investigating material found in digital devices, often in relation to computer crime. Key steps include identification, preservation, analysis, and documentation of digital evidence. Common tools include Autopsy, Magnet AXIOM, Volatility, and Wireshark.",
        "date": "2026-07-20"
    }
]

def main():
    pc_key = os.environ.get("PINECONE_API_KEY")
    hf_key = os.environ.get("HF_TOKEN")
    
    if not pc_key or not hf_key:
        print("Missing API keys. Please set PINECONE_API_KEY and HF_TOKEN.")
        return
        
    print("Ingesting static knowledge base...")
    rag_engine.upsert_articles(STATIC_KNOWLEDGE, pc_key, hf_key)
    print("Done.")

if __name__ == "__main__":
    main()
