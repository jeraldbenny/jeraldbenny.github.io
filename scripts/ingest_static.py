import os
import rag_engine

STATIC_KNOWLEDGE = [
    {
        "id": "static-about-jerald",
        "title": "About Jerald Benny - Bio & Profile",
        "category": "Biography",
        "content": "Digital Forensics and Cybersecurity professional with expertise in mobile and computer forensics, malware analysis, multimedia authentication, and biometric analysis. Strong academic background in forensic science with hands-on experience in cybercrime investigations and teaching support. Creator and architect of [DigiFeed](https://jeraldbenny.qd.je/digifeed/), [DigiLab](https://jeraldbenny.qd.je/digilab/), [DigiPlay](https://jeraldbenny.qd.je/digiplay/), and DigiBot. Currently active as Business Analyst at Innefu Labs and empaneled Cyber Expert at Cyber Crime Wing (CCW) Chennai.",
        "date": "Continuous"
    },
    {
        "id": "static-experience",
        "title": "Jerald Benny - Professional Experience",
        "category": "Biography",
        "content": "Jerald Benny's professional experience includes:\n• Business Analyst at Innefu Labs (Present): Working on cybersecurity and intelligence products, digital forensics analysis, data modeling, and operational workflows.\n• Empaneled Cyber Expert at Cyber Crime Wing (CCW) Chennai (Oct 2024 – Present): Assisting cybercrime investigation units with digital forensic evidence analysis, mobile and computer forensics, technical advisory, and investigative reporting.\n• Intern at Cyber Crime Police Station, Crime Branch CID (Nov 2023 – Dec 2023): Handled mobile and disk forensics, case evidence handling, and forensic tool deployment.\n• Teaching Assistant / Academic Support: Hands-on experience mentoring students and training law enforcement personnel in cybercrime investigations, forensic software, and evidentiary workflows.",
        "date": "Continuous"
    },
    {
        "id": "static-projects",
        "title": "Jerald Benny - Key Projects & Platforms",
        "category": "Projects",
        "content": "Key platforms and projects developed by Jerald Benny:\n• [DigiFeed](https://jeraldbenny.qd.je/digifeed/): Automated threat intelligence and DFIR feed aggregator with daily AI summarization and semantic search.\n• [DigiLab](https://jeraldbenny.qd.je/digilab/): Browser-based forensic investigation and OSINT workbench featuring 5 specialized modules.\n• [DigiPlay](https://jeraldbenny.qd.je/digiplay/): Interactive cybersecurity training and CTF arena with hands-on forensics, reverse engineering, and threat challenges.\n• DigiBot: Context-aware digital forensics and threat intelligence AI assistant powered by neural vector search and RAG.",
        "date": "Continuous"
    },
    {
        "id": "static-contact",
        "title": "Contact & Links - Jerald Benny",
        "category": "Contact",
        "content": "To contact or connect with Jerald Benny:\n• Email: [jeraldbenny6@gmail.com](mailto:jeraldbenny6@gmail.com)\n• LinkedIn: [LinkedIn](https://www.linkedin.com/in/jerald-benny-8b9a6a36a)\n• GitHub: [GitHub](https://github.com/jeraldbenny)\n• Portfolio: [Portfolio](https://jeraldbenny.qd.je/) (or [GitHub Pages](https://jeraldbenny.github.io/))\n• Platforms: [DigiFeed](https://jeraldbenny.qd.je/digifeed/), [DigiLab](https://jeraldbenny.qd.je/digilab/), [DigiPlay](https://jeraldbenny.qd.je/digiplay/)\n• Location: Alappuzha, Kerala, India\nOpen to collaborations in digital forensic casework, cybersecurity research, and threat investigations.",
        "date": "Continuous"
    },
    {
        "id": "static-digifeed",
        "title": "DigiFeed - Threat Intelligence Platform",
        "category": "Platform",
        "content": "DigiFeed is Jerald Benny's automated threat intelligence hub. It synchronizes daily and checking sources across 6 categories:\nDFIR Articles (incident response, memory, disk, network forensics)\nResearch Papers (academic literature, arXiv, forensic science journals)\nGitHub Releases (latest versions of 52+ forensic tools)\nMalware Intelligence (MalwareBazaar, URLhaus, threat campaigns)\nIOC Feeds (ThreatFox, indicators of compromise, C2 IPs, hashes)\nCVE & Vulnerabilities (NVD, CISA KEV catalog, zero-days)",
        "date": "Continuous"
    },
    {
        "id": "static-digilab",
        "title": "DigiLab - Cyber Investigation Workbench",
        "category": "Platform",
        "content": "[DigiLab](https://jeraldbenny.qd.je/digilab/) is a browser-based cyber investigation workbench built by Jerald Benny containing 4 specialized forensic and OSINT modules:\n• Hash Engine\n• File & Image Examiner\n• Social & Identity OSINT\n• Email & Header Analyzer\n• OSINT & Threat Intel",
        "date": "Continuous"
    },
    {
        "id": "static-digiplay",
        "title": "DigiPlay - Cybersecurity CTF Arena",
        "category": "Platform",
        "content": "[DigiPlay](https://jeraldbenny.qd.je/digiplay/) is an interactive cybersecurity training and CTF (Capture The Flag) platform built by Jerald Benny for digital forensics, cryptography, reverse engineering, and threat analysis challenges.",
        "date": "Continuous"
    },
    {
        "id": "static-digibot",
        "title": "DigiBot - AI Assistant",
        "category": "System",
        "content": "DigiBot is an AI assistant built by Jerald Benny. It is designed to assist users with digital forensics inquiries, cybersecurity guidance, real-time threat intelligence analysis. ([DigiFeed](https://jeraldbenny.qd.je/digifeed/), [DigiLab](https://jeraldbenny.qd.je/digilab/), and [DigiPlay](https://jeraldbenny.qd.je/digiplay/)).",
        "date": "Continuous"
    },
    {
        "id": "static-skills",
        "title": "Technical Skills & Competencies - Jerald Benny",
        "category": "Skills",
        "content": "Technical skills and forensic competencies:\n• Digital Forensics: Mobile forensics (Android/iOS extraction and SQLite parsing), Computer/Disk forensics (NTFS/ext4 artifacts, registry hives, shellbags, event logs, MFT), Memory forensics (Volatility 3, process triage, kernel analysis).\n• Multimedia & Biometrics: Multimedia authentication (image forgery detection, EXIF analysis, metadata verification), Biometric analysis (fingerprint classification, facial forensics).\n• Threat Intelligence & Malware: Static and dynamic malware triage, IOC hunting, ThreatFox, YARA rules, MITRE ATT&CK mapping.\n• Tools: Autopsy, Volatility 3, FTK Imager, KAPE, Magnet AXIOM, Wireshark, Ghidra, ExifTool, Hashcat, CyberChef.\n• Programming & Automation: Python, JavaScript, Bash, SQL, Git, GitHub Actions CI/CD, Docker, REST APIs, ONNX runtime.",
        "date": "Continuous"
    },
    {
        "id": "static-forensics-basics",
        "title": "Digital Forensics Basics & Investigation Phases",
        "category": "Forensics",
        "content": "Digital Forensics involves recovering, preserving, and investigating material found in digital devices following strict chain of custody. Key phases include:\n1. Identification: Recognizing potential sources of electronic evidence (computers, mobile devices, IoT, cloud storage, network logs).\n2. Preservation: Securing and isolating digital evidence using write-blockers, hardware duplicators, and bit-stream forensic disk images (E01, RAW/DD) accompanied by cryptographic hash verification (MD5, SHA-256).\n3. Analysis: Examining file systems, deleted files, system logs, memory dumps, and application artifacts to reconstruct events and timelines.\n4. Documentation & Reporting: Presenting objective, court-admissible findings supported by verifiable technical data and chain of custody logs.",
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
