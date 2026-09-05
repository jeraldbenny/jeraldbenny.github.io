import os
import rag_engine

STATIC_KNOWLEDGE = [
    {
        "id": "static-about-jerald",
        "title": "About Jerald Benny",
        "category": "Biography",
        "content": "Jerald Benny is a digital forensics & cybersecurity analyst and researcher. He built DigiFeed and DigiLab to aggregate, curate, and analyze the latest articles, research papers, threat reports, CVE disclosures, and open-source tools in the DFIR (Digital Forensics and Incident Response) and cybersecurity space.",
        "date": "Continuous"
    },
    {
        "id": "static-chatbot-purpose",
        "title": "DIGIBOT / JB:INTEL-BOT Purpose",
        "category": "System",
        "content": "DIGIBOT (JB:INTEL-BOT) is an AI intelligence assistant built by Jerald Benny. Its vector database is continuously updated with curated digital forensics dispatches, IOCs, malware analyses, tool releases, and CVE disclosures from DigiFeed. It is designed to provide real-time, context-aware answers about cybersecurity dispatches, today's news, forensics investigations, and security research.",
        "date": "Continuous"
    },
    {
        "id": "static-forensics-basics",
        "title": "Digital Forensics Basics",
        "category": "Forensics",
        "content": "Digital Forensics is the field of recovering, preserving, and investigating material found in digital devices, often in relation to computer crime. Key phases include Identification, Preservation (forensic disk imaging and write-blocking), Analysis (artifact extraction, timeline reconstruction, memory forensics), and Reporting/Documentation of digital evidence. Common tools include Autopsy, Magnet AXIOM, Volatility 3, FTK Imager, KAPE, and Wireshark.",
        "date": "Continuous"
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
