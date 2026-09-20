/**
 * DIGIPLAY MASTER DATA REPOSITORY
 * Contains:
 * - QUESTION_BANK (90 quiz questions across 9 digital forensic domains)
 * - CASE_DOSSIERS (Investigation storylines for Case 1, Case 2, Case 3)
 * - CASE_EVIDENCE_MAP (30 forensic artifacts with 3D coordinates and descriptions)
 * - SPECIFIC_EVIDENCE_HINTS (Targeted hints for all 30 artifacts)
 */
(function(root) {

const QUESTION_BANK = {
  "Windows Forensics": [
    { diff: "Easy", q: "Which Windows tool displays system event logs and error messages?", opts: ["Event Viewer (eventvwr.msc)", "Calculator", "Notepad", "Paint"], ans: 0 },
    { diff: "Easy", q: "Where is user desktop data and personal files stored in Windows by default?", opts: ["C:\\Users\\<Username>", "C:\\Windows\\System32", "C:\\Program Files", "C:\\Drivers"], ans: 0 },
    { diff: "Easy", q: "What is the built-in Windows antivirus tool called?", opts: ["Windows Defender / Security", "WinZip", "Control Panel", "Task Scheduler"], ans: 0 },
    { diff: "Medium", q: "Which file holds recent user activities and desktop settings?", opts: ["NTUSER.DAT", "boot.ini", "hosts", "system.dll"], ans: 0 },
    { diff: "Medium", q: "What folder contains Windows temporary files that can be safely deleted?", opts: ["%TEMP%", "C:\\Windows\\System32", "C:\\Recovery", "C:\\ProgramData\\Microsoft"], ans: 0 },
    { diff: "Medium", q: "Which shortcut opens the Windows Task Manager?", opts: ["Ctrl + Shift + Esc", "Alt + F4", "Win + L", "Ctrl + P"], ans: 0 },
    { diff: "Advanced", q: "What Windows feature automatically saves point-in-time file copies for recovery?", opts: ["Volume Shadow Copy (VSS)", "Disk Defragmenter", "BitLocker", "Disk Management"], ans: 0 },
    { diff: "Advanced", q: "What is the main file table that tracks all files on an NTFS drive?", opts: ["Master File Table (MFT)", "Partition Table", "BIOS", "RAM"], ans: 0 },
    { diff: "Advanced", q: "Which utility encrypts full Windows hard drives for security?", opts: ["BitLocker", "Windows Update", "Paint 3D", "Cortana"], ans: 0 },
    { diff: "Advanced", q: "What file format do Windows 10/11 Event Logs use?", opts: [".evtx", ".mp3", ".doc", ".png"], ans: 0 }
  ],
  "Linux Forensics": [
    { diff: "Easy", q: "What command lists files and directories in Linux?", opts: ["ls", "pwd", "whoami", "exit"], ans: 0 },
    { diff: "Easy", q: "What command shows the current working directory path in Linux?", opts: ["pwd", "cd", "mkdir", "top"], ans: 0 },
    { diff: "Easy", q: "What is the root administrative user called in Linux?", opts: ["root", "admin", "system", "supervisor"], ans: 0 },
    { diff: "Medium", q: "Which directory stores system log files in Linux?", opts: ["/var/log", "/bin", "/home", "/lib"], ans: 0 },
    { diff: "Medium", q: "Where is user command history saved by default in Bash?", opts: ["~/.bash_history", "/tmp/history.txt", "/etc/history", "/dev/null"], ans: 0 },
    { diff: "Medium", q: "Which command displays active system processes and RAM usage in real-time?", opts: ["top / htop", "cat", "echo", "chmod"], ans: 0 },
    { diff: "Advanced", q: "Which file stores local user account names and IDs in Linux?", opts: ["/etc/passwd", "/etc/hosts", "/etc/resolv.conf", "/etc/network"], ans: 0 },
    { diff: "Advanced", q: "Which file stores encrypted user password hashes in Linux?", opts: ["/etc/shadow", "/etc/fstab", "/etc/shells", "/var/mail"], ans: 0 },
    { diff: "Advanced", q: "Which command grants temporary superuser privileges to a command?", opts: ["sudo", "grep", "find", "tar"], ans: 0 },
    { diff: "Advanced", q: "What special folder contains virtual process information in Linux?", opts: ["/proc", "/mnt", "/media", "/boot"], ans: 0 }
  ],
  "Memory Forensics": [
    { diff: "Easy", q: "What is RAM short for?", opts: ["Random Access Memory", "Read Access Media", "Rapid Application Module", "Remote Array Matrix"], ans: 0 },
    { diff: "Easy", q: "What happens to data in RAM when a computer is powered off?", opts: ["It is erased (volatile)", "It is saved forever", "It is sent to the printer", "It turns into a PDF"], ans: 0 },
    { diff: "Easy", q: "Why do investigators dump RAM early during a cyber incident?", opts: ["To capture running processes and passwords before power loss", "To clean disk space", "To speed up Wi-Fi", "To format the computer"], ans: 0 },
    { diff: "Medium", q: "Which famous open-source framework is used to analyze RAM dumps?", opts: ["Volatility", "Photoshop", "Excel", "VLC Player"], ans: 0 },
    { diff: "Medium", q: "What file extension is commonly used for raw memory dumps?", opts: [".raw / .dmp / .mem", ".mp4", ".docx", ".zip"], ans: 0 },
    { diff: "Medium", q: "Which Windows process manages user logons and security tokens?", opts: ["lsass.exe", "notepad.exe", "calc.exe", "mspaint.exe"], ans: 0 },
    { diff: "Advanced", q: "What is malware called that runs only in RAM without creating disk files?", opts: ["Fileless malware / Memory-only malware", "Macro virus", "Trojan horse", "Adware"], ans: 0 },
    { diff: "Advanced", q: "Which Volatility command lists active running processes from a RAM dump?", opts: ["pslist / pstree", "netstat", "ipconfig", "diskpart"], ans: 0 },
    { diff: "Advanced", q: "What does a crash dump file (.dmp) contain?", opts: ["Snapshot of system memory when a critical error occurred", "Browser cookies", "Installed games", "Audio recordings"], ans: 0 },
    { diff: "Advanced", q: "What Volatility plugin helps detect hidden code injected into memory?", opts: ["malfind", "ping", "tracert", "dir"], ans: 0 }
  ],
  "Network Forensics": [
    { diff: "Easy", q: "What protocol is used to browse secure encrypted websites?", opts: ["HTTPS (Port 443)", "FTP", "Telnet", "SMTP"], ans: 0 },
    { diff: "Easy", q: "What popular tool is used to capture and analyze network packets?", opts: ["Wireshark", "Wordpad", "Paint", "Calculator"], ans: 0 },
    { diff: "Easy", q: "What is an IP address used for?", opts: ["Uniquely identifying a device on a network", "Storing photos", "Playing music", "Formatting hard drives"], ans: 0 },
    { diff: "Medium", q: "What standard file extension is used for captured network packets?", opts: [".pcap / .pcapng", ".txt", ".exe", ".png"], ans: 0 },
    { diff: "Medium", q: "Which service translates domain names (like google.com) into IP addresses?", opts: ["DNS (Domain Name System)", "DHCP", "FTP", "SSH"], ans: 0 },
    { diff: "Medium", q: "What protocol automatically assigns IP addresses to devices on a network?", opts: ["DHCP", "DNS", "HTTP", "SNMP"], ans: 0 },
    { diff: "Advanced", q: "What is an unauthorized attempt to scan multiple network ports called?", opts: ["Port Scan", "Screen Capture", "Defragmentation", "System Restore"], ans: 0 },
    { diff: "Advanced", q: "What protocol is used to securely log into remote Linux servers via command line?", opts: ["SSH (Port 22)", "HTTP", "POP3", "RDP"], ans: 0 },
    { diff: "Advanced", q: "What type of attack floods a server with traffic to make it unavailable?", opts: ["DDoS (Distributed Denial of Service)", "Phishing", "Keylogging", "Shoulder Surfing"], ans: 0 },
    { diff: "Advanced", q: "What Wireshark filter display expression isolates HTTP traffic?", opts: ["http", "ip.addr", "dns", "frame"], ans: 0 }
  ],
  "Email Forensics": [
    { diff: "Easy", q: "What is a deceptive email designed to steal passwords called?", opts: ["Phishing Email", "Spam filter", "Newsletter", "Auto-reply"], ans: 0 },
    { diff: "Easy", q: "What standard file extension is used for individual saved email messages?", opts: [".eml / .msg", ".jpg", ".exe", ".mp3"], ans: 0 },
    { diff: "Easy", q: "Which email header field shows who sent the email?", opts: ["From:", "To:", "Subject:", "Date:"], ans: 0 },
    { diff: "Medium", q: "Which email header field shows the topic or title of the email?", opts: ["Subject:", "Bcc:", "Cc:", "Reply-To:"], ans: 0 },
    { diff: "Medium", q: "What type of email file attachment often contains hidden malicious code?", opts: [".iso / .exe / .zip", ".txt", ".jpg", ".mp3"], ans: 0 },
    { diff: "Medium", q: "What does Bcc stand for in email sending?", opts: ["Blind Carbon Copy", "Basic Mail Code", "Binary Communication Channel", "Backup Copy Center"], ans: 0 },
    { diff: "Advanced", q: "What email authentication record specifies authorized sending mail servers for a domain?", opts: ["SPF (Sender Policy Framework)", "HTML", "URL", "PDF"], ans: 0 },
    { diff: "Advanced", q: "What email standard adds a digital cryptographic signature to emails?", opts: ["DKIM", "FTP", "DHCP", "DNS"], ans: 0 },
    { diff: "Advanced", q: "What Microsoft Outlook data file stores emails and calendar items locally on disk?", opts: [".pst / .ost", ".docx", ".xlsx", ".pptx"], ans: 0 },
    { diff: "Advanced", q: "Which email header section lists every mail server the message passed through?", opts: ["Received: headers", "Body:", "Footer:", "Attachment:"], ans: 0 }
  ],
  "Mobile Forensics": [
    { diff: "Easy", q: "What command-line tool connects an Android phone to a computer via USB?", opts: ["ADB (Android Debug Bridge)", "iTunes", "Bluetooth", "AirDrop"], ans: 0 },
    { diff: "Easy", q: "What lightweight database format is used by most mobile apps to store chat logs?", opts: ["SQLite", "Oracle", "MongoDB", "Cassandra"], ans: 0 },
    { diff: "Easy", q: "What useful location data can be embedded inside smartphone camera photos?", opts: ["GPS Coordinates (Exif data)", "Wi-Fi Password", "SIM PIN", "Device Serial"], ans: 0 },
    { diff: "Medium", q: "What unique 15-digit number identifies a mobile phone hardware device globally?", opts: ["IMEI", "IP Address", "MAC Address", "Zip Code"], ans: 0 },
    { diff: "Medium", q: "What card inside a mobile phone connects it to a cellular network carrier?", opts: ["SIM Card", "SD Card", "Graphics Card", "Sound Card"], ans: 0 },
    { diff: "Medium", q: "What Apple desktop application was traditionally used to back up iOS devices?", opts: ["iTunes / Finder", "Safari", "Keynote", "GarageBand"], ans: 0 },
    { diff: "Advanced", q: "What type of extraction makes an exact bit-by-bit copy of a mobile phone's flash memory?", opts: ["Physical Extraction", "Logical Extraction", "Screenshot", "Manual Recording"], ans: 0 },
    { diff: "Advanced", q: "What file extension do iOS configuration and app preference files use?", opts: [".plist (Property List)", ".exe", ".bat", ".dll"], ans: 0 },
    { diff: "Advanced", q: "What security feature encrypts Android user data at rest on modern phones?", opts: ["File-Based Encryption (FBE)", "Airplane Mode", "Auto-Rotate", "Dark Mode"], ans: 0 },
    { diff: "Advanced", q: "What specialized commercial hardware/software is widely used by law enforcement for phone forensics?", opts: ["Cellebrite / MSAB XRY", "Wireshark", "WinRAR", "Notepad++"], ans: 0 }
  ],
  "Browser Forensics": [
    { diff: "Easy", q: "What are small text files stored by websites on your computer to remember login sessions?", opts: ["Cookies", "Bookmarks", "Downloads", "Themes"], ans: 0 },
    { diff: "Easy", q: "What browser feature saves a record of all websites you have visited?", opts: ["Browser History", "Cache", "Incognito", "Extensions"], ans: 0 },
    { diff: "Easy", q: "Where does Google Chrome store browser history on Windows?", opts: ["AppData\\Local\\Google\\Chrome\\User Data\\Default\\History", "C:\\Windows", "C:\\Program Files", "C:\\Temp"], ans: 0 },
    { diff: "Medium", q: "What database engine format does Google Chrome use to store history and web data?", opts: ["SQLite 3", "XML", "JSON", "TXT"], ans: 0 },
    { diff: "Medium", q: "What browser mode attempts to prevent search history and cookies from being saved locally?", opts: ["Incognito / Private Browsing", "Full Screen Mode", "Developer Mode", "Desktop Mode"], ans: 0 },
    { diff: "Medium", q: "What temporary browser folder stores web images and pages to speed up future loading?", opts: ["Browser Cache", "Downloads Folder", "Recycle Bin", "Desktop"], ans: 0 },
    { diff: "Advanced", q: "Which file in Mozilla Firefox stores browsing history and saved bookmarks?", opts: ["places.sqlite", "history.txt", "bookmarks.doc", "log.xml"], ans: 0 },
    { diff: "Advanced", q: "How are saved passwords protected in Google Chrome on Windows?", opts: ["Encrypted using Windows DPAPI", "Saved in plain text", "Sent to email", "Stored on printer"], ans: 0 },
    { diff: "Advanced", q: "What browser file tracks installed add-ons and browser extensions?", opts: ["manifest.json", "index.html", "style.css", "autorun.inf"], ans: 0 },
    { diff: "Advanced", q: "What timestamp format is used by Chromium browsers (microseconds since Jan 1, 1601)?", opts: ["WebKit Timestamp", "Unix Timestamp", "ISO Date", "Julian Date"], ans: 0 }
  ],
  "Malware Analysis": [
    { diff: "Easy", q: "What is software designed to cause harm or steal data called?", opts: ["Malware", "Firmware", "Shareware", "Freeware"], ans: 0 },
    { diff: "Easy", q: "What is an isolated, safe test environment used to run and observe malware behavior?", opts: ["Sandbox", "Web Browser", "Text Editor", "Printer"], ans: 0 },
    { diff: "Easy", q: "What type of malware encrypts your files and demands payment to unlock them?", opts: ["Ransomware", "Adware", "Spyware", "Keylogger"], ans: 0 },
    { diff: "Medium", q: "What is the difference between Static and Dynamic malware analysis?", opts: ["Static examines code without executing; Dynamic runs malware in a sandbox", "Static runs malware; Dynamic only reads text", "No difference", "Static requires Wi-Fi"], ans: 0 },
    { diff: "Medium", q: "What Sysinternals tool monitors process, file system, and registry activity in real time?", opts: ["Process Monitor (ProcMon)", "Calculator", "Wordpad", "Paint"], ans: 0 },
    { diff: "Medium", q: "What type of malware records your keystrokes to steal passwords?", opts: ["Keylogger", "Ransomware", "Worm", "Rootkit"], ans: 0 },
    { diff: "Advanced", q: "What free open-source reverse engineering tool was released by the NSA?", opts: ["Ghidra", "IDA Pro", "OllyDbg", "Wireshark"], ans: 0 },
    { diff: "Advanced", q: "What pattern-matching rule language is used by security analysts to classify malware samples?", opts: ["YARA", "HTML", "CSS", "SQL"], ans: 0 },
    { diff: "Advanced", q: "What executable file section (.text / .data / .rsrc) contains the actual machine instructions?", opts: [".text", ".rsrc", ".reloc", ".idata"], ans: 0 },
    { diff: "Advanced", q: "What technique hides malicious code inside a legitimate process memory space?", opts: ["Process Injection", "Disk Formatting", "Defragmentation", "Port Forwarding"], ans: 0 }
  ],
  "File Systems & Incident Response": [
    { diff: "Easy", q: "What is the main goal of the Containment phase in Incident Response?", opts: ["Stop the attack from spreading further", "Format all computers", "Write press release", "Delete logs"], ans: 0 },
    { diff: "Easy", q: "What does C2 stand for in cyber incident response?", opts: ["Command and Control", "Cyber Center", "Computer Code", "Central Core"], ans: 0 },
    { diff: "Easy", q: "What is a decoy computer system set up to attract and study attackers called?", opts: ["Honeypot", "Firewall", "Router", "Switch"], ans: 0 },
    { diff: "Medium", q: "What hardware device is connected to a hard drive to prevent any data modification during forensic imaging?", opts: ["Hardware Write-Blocker", "USB Hub", "Network Card", "Power Strip"], ans: 0 },
    { diff: "Medium", q: "What documentation proves who handled evidence, when it was transferred, and where it was stored?", opts: ["Chain of Custody", "User Manual", "Privacy Policy", "Terms of Service"], ans: 0 },
    { diff: "Medium", q: "What mechanism in modern file systems logs changes before writing them to prevent disk corruption?", opts: ["Journaling", "Compression", "Defragmentation", "Partitioning"], ans: 0 },
    { diff: "Advanced", q: "What framework created by MITRE maps real-world adversary tactics and techniques?", opts: ["MITRE ATT&CK", "ISO 9001", "GDPR", "OWASP"], ans: 0 },
    { diff: "Advanced", q: "What is the Order of Volatility rule in forensic evidence collection?", opts: ["Collect RAM and active network connections before powered-off hard drives", "Image disk first, RAM last", "Read printed paper first", "Take photos last"], ans: 0 },
    { diff: "Advanced", q: "What standard file system is used by modern Apple macOS computers?", opts: ["APFS (Apple File System)", "NTFS", "FAT32", "EXT4"], ans: 0 },
    { diff: "Advanced", q: "What are the first few unique bytes at the start of a file used to identify its file type called?", opts: ["Magic Bytes / File Signature", "Extension", "File Name", "File Size"], ans: 0 }
  ]
};

const CASE_DOSSIERS = {
  1: {
    title: "THE SUSPICIOUS OFFICE",
    story: "At 23:45 PM, automated SIEM security alerts flagged suspicious unauthorized activity on Executive Assistant Alex's primary terminal. Physical security logs reveal an unidentified individual entering the executive suite at 23:40 PM using a spoofed keycard. Digital surveillance footage captured brief tampering in the room before camera signals were temporarily disrupted. Your mission: conduct a thorough forensic sweep of the office, discover all 10 digital and physical artifacts, and reconstruct the attack chain."
  },
  2: {
    title: "INSIDER THEFT — HOTEL SUITE",
    story: "Following a critical intellectual property leak investigation, a senior software architect suspected of exfiltrating confidential corporate source code was tracked to a luxury hotel suite. Surveillance reports indicate an illicit midnight meeting with an external broker. Federal law enforcement obtained an emergency search warrant and secured the premises immediately after the suspect vacated. Conduct a forensic examination of the suite to secure all 10 evidentiary items before forensic integrity is compromised."
  },
  3: {
    title: "RANSOMWARE INCIDENT — SOC SERVER ROOM",
    story: "At 03:15 AM, critical infrastructure monitors in the SOC server room triggered emergency alarms as a catastrophic cyber incident unfolded. Systems across primary network storage arrays began rapidly corrupting, rendering data unavailable across corporate departments. Main monitoring displays froze, presenting a ransomware countdown demanding a cryptocurrency payment. Search the server room, inspect the hardware racks and workstation, and isolate all 10 critical forensic artifacts."
  }
};

const CASE_EVIDENCE_MAP = {
  1: [
    { id: "usb",      name: "USB DRIVE",        pos: [-0.4, 0.76, 0.4],   desc: "USB containing a reverse shell payload script." },
    { id: "sticky",   name: "STICKY NOTE PASSWORD", pos: [0.5, 0.751, 0.3], desc: "Sticky note with written credentials." },
    { id: "phone",    name: "MOBILE PHONE",     pos: [-0.25, 0.756, 0.4], desc: "Locked smartphone with some message notification on lock screen." },
    { id: "invoice",  name: "FAKE INVOICE",     pos: [-1.8, 0.745, -0.2], desc: "Fake invoice document." },
    { id: "hdd",      name: "HDD",              pos: [-0.9, 0.765, -0.2], desc: "External hard drive." },
    { id: "router",   name: "ROUTER",           pos: [2.0, 1.23, -1.2],   desc: "Router containing logs, IDs, traffic volume, visited domains or IP, active devices, etc..." },
    { id: "laptop",   name: "LAPTOP",           pos: [0.0, 0.76, -0.1],   desc: "Laptop which is in the turned on position." },
    { id: "cctv",     name: "CCTV",             pos: [2.4, 2.4, -2.45],   desc: "Security camera lens covered with black tape." },
    { id: "crumpled", name: "CRUMPLED PAPER",   pos: [-1.8, 0.42, 0.8],   desc: "Crumpled paper scraps found near the waste bin." },
    { id: "coffee",   name: "SPILLED COFFEE",   pos: [-0.55, 0.751, -0.3], desc: "Fresh warm coffee spill confirming recent physical presence." }
  ],
  2: [
    { id: "laptop2",     name: "LAPTOP",         pos: [-1.50, 0.76, 0.55], desc: "Laptop running script transferring source code to offshore server." },
    { id: "burnerphone", name: "PHONE",          pos: [ 1.15, 0.49,-1.35], desc: "Phone which is showing a missed call and a message from Signal." },
    { id: "sdcard2",     name: "SD CARD",        pos: [-0.95, 0.76, 0.75], desc: "64GB MicroSD card." },
    { id: "envelope",    name: "CASH ENVELOPE",  pos: [ 0.25, 0.53,-0.70], desc: "Envelope containing $15,000 in unmarked bills." },
    { id: "badge2",      name: "CLONED ACCESS BADGE", pos: [ 0.95, 0.49,-1.50], desc: "Cloned RFID employee badge." },
    { id: "hdd2",        name: "HDD",            pos: [ 1.26, 0.52,-0.40], desc: "2TB Portable drive found inside suitcase." },
    { id: "stickyhotel", name: "STICKY NOTE WITH IPs", pos: [-2.05, 0.76, 0.35], desc: "Sticky note with credentials." },
    { id: "shredded",    name: "SHREDDED DOCUMENTS", pos: [-2.00, 0.01, 1.20], desc: "Shredded paper strips near waste bin." },
    { id: "vpnrouter",   name: "PORTABLE VPN ROUTER", pos: [-0.95, 0.76, 0.35], desc: "Travel router on desk, tunnelling traffic through hotel Wi-Fi." },
    { id: "notebook2",   name: "SPIRAL NOTEBOOK", pos: [-0.35, 0.53,-1.20], desc: "Spiral notebook with writings." }
  ],
  3: [
    { id: "switch",   name: "NETWORK SWITCH", pos: [-0.90, 0.33,-2.50], desc: "Rack-mount switch." },
    { id: "nas",      name: "NAS",            pos: [-0.90, 0.825,-2.50], desc: "NAS with all volumes connected." },
    { id: "fw",       name: "FIREWALL ALERT CONSOLE", pos: [-0.90, 1.14,-2.50], desc: "Firewall showing 10,000+ outbound connections to C2 IP." },
    { id: "redusb",   name: "RANSOMWARE USB", pos: [-0.68, 0.33,-2.36], desc: "Suspicious USB near switch." },
    { id: "crypto",   name: "HARDWARE CRYPTO WALLET", pos: [-1.15, 0.76, 0.25], desc: "Hardware wallet used to receive ransom payment." },
    { id: "phish",    name: "PRINTOUT",       pos: [-2.20, 0.76, 0.20], desc: "Print outs of confidencial emails." },
    { id: "lockedpc", name: "LOCK SCREEN",    pos: [-1.55, 0.76, 0.05], desc: "Monitor displaying LockBit 3.0 ransomware countdown timer." },
    { id: "btc",      name: "BITCOIN RANSOM NOTE", pos: [-2.15, 0.76, 0.48], desc: "Printed ransom note demanding ransom with wallet address." },
    { id: "malware",  name: "FLOPPY DISK",    pos: [-1.00, 0.76, 0.48], desc: "3.5-inch floppy disk." },
    { id: "backup",   name: "BACKUP DRIVE",   pos: [ 0.90, 0.32,-2.50], desc: "External SSD." }
  ]
};

const SPECIFIC_EVIDENCE_HINTS = {
  // Case 1
  "usb": "Search around the main computer workstation's USB ports.",
  "sticky": "Look closely at the flat surface of the main desk near the monitor screen.",
  "phone": "Search the main desk surface for a smartphone.",
  "invoice": "Look at the side table surface next to the office printer.",
  "hdd": "Check the table surface next to the keyboard or PC tower.",
  "router": "Look up on the wall shelves or network mount points.",
  "laptop": "Examine the workstation laptop sitting open on the desk.",
  "cctv": "Look up at the high corner of the room near the ceiling.",
  "crumpled": "Search the floor around the trash waste bin.",
  "coffee": "Look for a liquid stain on the desk surface next to the workstation.",

  // Case 2
  "laptop2": "Look on the hotel desk for an open laptop.",
  "burnerphone": "Check the nightstand drawer/table surface next to the bed.",
  "sdcard2": "Inspect the desk surface carefully for a tiny storage card.",
  "envelope": "Search on top of the hotel bed mattress.",
  "badge2": "Check the bedside table/nightstand surface.",
  "hdd2": "Inspect the inside of the open suitcase on the floor.",
  "stickyhotel": "Look closely at the desk surface or wall panels near the laptop.",
  "shredded": "Check the floor area near the trash can.",
  "vpnrouter": "Look on the desk surface near the network connections.",
  "notebook2": "Check the bed surface next to the pillows.",

  // Case 3
  "switch": "Check the middle server rack shelf (Rack 2) for active network ports.",
  "nas": "Examine the storage enclosure on the middle server rack shelf (Rack 2).",
  "fw": "Inspect the rack-mount display console on the middle server rack (Rack 2).",
  "redusb": "Look at the front switch interface plugged into Rack 2.",
  "crypto": "Check the desk surface near the monitors.",
  "phish": "Look at the table surface near the workstation console.",
  "lockedpc": "Examine the main workstation monitor screen.",
  "btc": "Check the desk surface or printed sheets near the keyboard.",
  "malware": "Search the flat desk surface near the disk reader.",
  "backup": "Look at the right server rack shelf (Rack 3) for storage media."
};

// Global window exposure for standalone & Ops dashboard access
root.QUESTION_BANK = QUESTION_BANK;
root.CASE_DOSSIERS = CASE_DOSSIERS;
root.CASE_EVIDENCE_MAP = CASE_EVIDENCE_MAP;
root.SPECIFIC_EVIDENCE_HINTS = SPECIFIC_EVIDENCE_HINTS;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
