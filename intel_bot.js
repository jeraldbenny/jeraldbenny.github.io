/**
 * JB:INTEL-BOT Widget Logic
 */

(function() {
    // DigiBot is intentionally excluded from DigiPlay to keep the 3D CTF arena unobstructed
    if (window.location.pathname.includes('/digiplay/')) {
        return;
    }

    const isSubFolder = window.location.pathname.includes('/digifeed/') || 
                        window.location.pathname.includes('/digilab/') || 
                        window.location.pathname.includes('/toolkit/');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = isSubFolder ? '../intel_bot.css' : 'intel_bot.css';
    document.head.appendChild(link);

    const avatarPath = isSubFolder ? '../digibot_avatar.png' : 'digibot_avatar.png';

    const botHTML = `
        <div id="jb-intel-bot-container">
            <div id="jb-intel-bot-window">
                <div id="jb-intel-bot-header">
                    <div class="jb-intel-title">
                        <img src="${avatarPath}" class="jb-intel-avatar" alt="Bot">
                        <div class="jb-intel-status"></div>
                        DIGIBOT
                    </div>
                    <button id="jb-intel-bot-reset" title="Clear Chat">✖</button>
                </div>
                <div id="jb-intel-bot-history">
                    <div class="jb-msg bot">I am DIGIBOT. Digital forensics archive loaded. How can I help you today?</div>
                    <div class="jb-suggestions" id="jb-intel-bot-suggestions">
                        <!-- Suggestions will be injected here by JS -->
                    </div>
                </div>
                <div id="jb-intel-bot-chips-bar" class="jb-chips-bar"></div>
                <div id="jb-intel-bot-input-area">
                    <input type="text" id="jb-intel-bot-input" placeholder="Ask a question..." autocomplete="off">
                    <button id="jb-intel-bot-send">SEND</button>
                </div>
            </div>
            <div id="jb-intel-bot-toggle">
                <img src="${avatarPath}" class="jb-toggle-img" alt="DIGIBOT">
                <div class="jb-tooltip">Hai, I'm DIGIBOT.</div>
            </div>
        </div>
    `;

    // Append to body on load
    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => {
            document.body.insertAdjacentHTML('beforeend', botHTML);
            initBot();
        });
    } else {
        document.body.insertAdjacentHTML('beforeend', botHTML);
        initBot();
    }

    function initBot() {
        const toggleBtn = document.getElementById('jb-intel-bot-toggle');
        const chatWindow = document.getElementById('jb-intel-bot-window');
        const inputField = document.getElementById('jb-intel-bot-input');
        const sendBtn = document.getElementById('jb-intel-bot-send');
        const historyArea = document.getElementById('jb-intel-bot-history');
        const suggestionsDiv = document.getElementById('jb-intel-bot-suggestions');
        const resetBtn = document.getElementById('jb-intel-bot-reset');
        const chipsBar = document.getElementById('jb-intel-bot-chips-bar');

        const chatHistory = [];

        // Category Filter Chips (Strictly NO EMOJIS, NO BRACKETS)
        const categoryChips = [
            { label: "DFIR", query: "top 10 dfir news of today" },
            { label: "FORENSICS", query: "top 10 forensic news of today" },
            { label: "MALWARE", query: "top 5 malware news of today" },
            { label: "CVES", query: "top 10 cves of today" },
            { label: "IOC FEED", query: "latest ioc feed" },
            { label: "RELEASES", query: "latest forensic tool releases" },
            { label: "PAPERS", query: "latest research papers" },
            { label: "STATUS", query: "system status and last update" }
        ];

        if (chipsBar) {
            chipsBar.innerHTML = '';
            categoryChips.forEach(chip => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'jb-chip';
                btn.textContent = chip.label;
                btn.title = `Query ${chip.label}`;
                btn.onclick = () => {
                    inputField.value = chip.query;
                    sendMessage();
                };
                chipsBar.appendChild(btn);
            });
        }

        const allQuestions = [
            "What is DigiFeed?",
            "Who is Jerald Benny?",
            "Define digital forensics.",
            "What is OSINT?",
            "How do I start a career in cybersecurity?",
            "What is malware analysis?",
            "Explain ransomware simply.",
            "What is biometric authentication?",
            "Why is cyber security important?",
            "What is mobile forensics?"
        ];

        // Shuffle and pick 2
        const shuffled = allQuestions.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 2);

        selected.forEach(q => {
            const btn = document.createElement('div');
            btn.className = 'jb-suggestion';
            btn.textContent = q;
            btn.onclick = () => {
                inputField.value = q;
                sendBtn.click();
            };
            suggestionsDiv.appendChild(btn);
        });

        function populateSuggestions() {
            suggestionsDiv.innerHTML = '';
            const shuf = allQuestions.sort(() => 0.5 - Math.random());
            shuf.slice(0, 2).forEach(q => {
                const btn = document.createElement('div');
                btn.className = 'jb-suggestion';
                btn.textContent = q;
                btn.onclick = () => {
                    inputField.value = q;
                    sendBtn.click();
                };
                suggestionsDiv.appendChild(btn);
            });
        }

        resetBtn.addEventListener('click', () => {
            historyArea.innerHTML = '';
            chatHistory.length = 0;
            
            const welcomeMsg = document.createElement('div');
            welcomeMsg.className = 'jb-msg bot';
            welcomeMsg.textContent = 'I am DIGIBOT. Digital forensics archive loaded. How can I help you today?';
            historyArea.appendChild(welcomeMsg);
            
            suggestionsDiv.style.display = 'flex';
            populateSuggestions();
            historyArea.appendChild(suggestionsDiv);
        });

        let isOpen = false;

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isOpen = !isOpen;
            if (isOpen) {
                chatWindow.classList.add('open');
                toggleBtn.classList.add('active');
                inputField.focus();
            } else {
                chatWindow.classList.remove('open');
                toggleBtn.classList.remove('active');
            }
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            const container = document.getElementById('jb-intel-bot-container');
            if (isOpen && container && !container.contains(e.target)) {
                isOpen = false;
                chatWindow.classList.remove('open');
                toggleBtn.classList.remove('active');
            }
        });

        function parseMarkdown(text) {
            if (!text) return '';
            
            // 0. Cut off severe repetition loops (e.g. 5+ repeats of identical token/word sequences like "gationgation" or "aW9uZ2F0")
            text = text.replace(/(.{4,35}?)\1{5,}/gs, '$1');

            // Normalize broken markdown links where [Title] and (URL) have whitespace or newlines between them
            // e.g. [Title]\n(url) -> [Title](url)
            text = text.replace(/\[([^\]\r\n]+)\][\s\r\n]+(\((?:https?:\/\/|mailto:)[^\s)]+\))/g, '[$1]$2');

            // Clean up any Google News base64 tracking redirect URLs into clean DigiFeed URLs
            text = text.replace(/https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_\-\+]+(?:\?[^\s\)]+)?/g, 'https://jeraldbenny.github.io/digifeed/');

            // Normalize nested bracket headlines: [[Tag] Title](url) -> [Tag: Title](url)
            text = text.replace(/\[\[([^\]]+)\]\s*([^\]]+)\][\s\r\n]*\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '[$1: $2]($3)');
            // [Tag] Title](url) -> [Tag: Title](url)
            text = text.replace(/\[([^\]\n]+)\]\s*([^\]\n]+)\][\s\r\n]*\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '[$1: $2]($3)');

            // 1. Escape HTML entities
            let html = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            // 2. Extract code blocks
            const codeBlocks = [];
            html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
                const id = `___CODEBLOCK_${codeBlocks.length}___`;
                codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
                return id;
            });

            // 3. Extract inline code
            const inlineCodes = [];
            html = html.replace(/`([^`]+)`/g, (match, code) => {
                const id = `___INLINECODE_${inlineCodes.length}___`;
                inlineCodes.push(`<code>${code}</code>`);
                return id;
            });

            // 4. Bold and Italic
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

            // 5. Links (http/https and mailto) - Embedded in Title (allowing optional whitespace between ] and ()
            html = html.replace(/\[([^\]]+)\][\s\r\n]*\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

            // Fallback 1: If any stray ](http...) exists after a bullet dash, turn preceding text into a link
            html = html.replace(/—\s*([^<\n]+)\][\s\r\n]*\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, '— <a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

            // Fallback 2: Any orphaned (https://...) in parentheses turned into a clean clickable link
            html = html.replace(/\(((?:https?:\/\/)[^\s)]+)\)/g, '(<a href="$1" target="_blank" rel="noopener noreferrer">Source Link</a>)');

            // 6. Bullet lists
            // Normalize bullets: ensure bullets start on a newline even if squished against prior text
            html = html.replace(/([^\n])\s*•\s*/g, '$1\n• ');
            html = html.replace(/^[\s]*[•\*-]\s+(.*)$/gm, '<li>$1</li>');
            html = html.replace(/((?:<li>.*<\/li>[\r\n]*)+)/g, '<ul>$1</ul>');

            // Remove internal linebreaks inside ul before br replacement
            html = html.replace(/(<ul>[\s\S]*?<\/ul>)/g, (match) => {
                return match.replace(/[\r\n]+/g, '');
            });

            // 7. Line breaks
            html = html.replace(/\n/g, '<br>');

            // 8. Clean up extra breaks around blocks
            html = html.replace(/<br>\s*<ul>/g, '<ul>');
            html = html.replace(/<\/ul>\s*<br>/g, '</ul>');
            html = html.replace(/<br>\s*<pre>/g, '<pre>');
            html = html.replace(/<\/pre>\s*<br>/g, '</pre>');

            // 9. Restore code blocks & inline code
            inlineCodes.forEach((codeHTML, i) => {
                html = html.replace(`___INLINECODE_${i}___`, codeHTML);
            });
            codeBlocks.forEach((blockHTML, i) => {
                html = html.replace(`___CODEBLOCK_${i}___`, blockHTML);
            });

            return html;
        }

        function appendMessage(text, sender) {
            if (suggestionsDiv && sender === 'user') suggestionsDiv.style.display = 'none';
            const msgDiv = document.createElement('div');
            msgDiv.className = `jb-msg ${sender}`;
            
            if (sender === 'bot') {
                msgDiv.innerHTML = parseMarkdown(text);
                
                const copyBtn = document.createElement('button');
                copyBtn.className = 'jb-copy-btn';
                copyBtn.innerHTML = '⎘';
                copyBtn.title = "Copy to clipboard";
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(text);
                    copyBtn.innerHTML = '✔';
                    setTimeout(() => copyBtn.innerHTML = '⎘', 2000);
                };
                msgDiv.appendChild(copyBtn);
            } else {
                msgDiv.textContent = text;
            }
            
            historyArea.appendChild(msgDiv);
            historyArea.scrollTop = historyArea.scrollHeight;
        }

        function showTyping() {
            const indicator = document.createElement('div');
            indicator.className = 'jb-msg bot jb-typing-indicator';
            indicator.id = 'jb-typing';
            indicator.innerHTML = '<div class="jb-dot"></div><div class="jb-dot"></div><div class="jb-dot"></div>';
            historyArea.appendChild(indicator);
            historyArea.scrollTop = historyArea.scrollHeight;
        }

        function removeTyping() {
            const indicator = document.getElementById('jb-typing');
            if (indicator) {
                indicator.remove();
            }
        }

        async function sendMessage() {
            const text = inputField.value.trim();
            if (!text) return;

            appendMessage(text, 'user');
            chatHistory.push({ role: 'user', content: text });
            inputField.value = '';
            showTyping();

            try {
                const WORKER_URL = "https://jb-intel-bot-api.jeraldbenny04-c7a.workers.dev";
                
                const response = await fetch(WORKER_URL, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream, application/json'
                    },
                    body: JSON.stringify({ 
                        message: text,
                        history: chatHistory.slice(-6),
                        stream: true
                    })
                });

                removeTyping();
                
                if (!response.ok) {
                    console.warn("API bridge unavailable, engaging client-side intelligence engine...");
                    try {
                        const lower = text.toLowerCase();
                        
                        // 1. Cybersecurity Career & Guidance
                        if (lower.includes("career") || (lower.includes("start") && lower.includes("cyber")) || lower.includes("become") || lower.includes("roadmap") || lower.includes("getting started") || lower.includes("learn cyber")) {
                            appendMessage(`🎯 **HOW TO START A CAREER IN CYBERSECURITY & FORENSICS**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nA structured roadmap based on modern industry standards:\n\n1. **Core Networking & System Fundamentals**:\n   • Understand TCP/IP, OSI model, subnetting, DNS, and packet analysis with **Wireshark**.\n   • Master Windows Internals (Registry, Event Logs, NTFS) and Linux CLI navigation.\n\n2. **Hands-On Lab Practice & Investigations**:\n   • Practice real-world defense on **TryHackMe** and **Hack The Box**.\n   • Examine forensic artifacts & cryptographic hashes in [DigiLab](https://jeraldbenny.github.io/digilab/).\n   • Investigate 3D WebGL crime scenes & evidence in [DigiPlay](https://jeraldbenny.github.io/digiplay/).\n\n3. **Industry Certifications to Target**:\n   • **Foundation**: ISC2 Certified in Cybersecurity (CC) or CompTIA Security+.\n   • **DFIR & Blue Team**: Blue Team Level 1 (BTL1), CHFI, or GIAC GCIH / GCFA.\n\n4. **Stay Ahead with Live Intelligence**:\n   • Track daily CVEs, malware reports, and forensic case studies on [DigiFeed](https://jeraldbenny.github.io/digifeed/).`, 'bot');
                            return;
                        }

                        // 2. Questions about Jerald Benny
                        if (lower.includes("jerald") || lower.includes("who are you") || lower.includes("creator") || lower.includes("author") || lower.includes("who made")) {
                            appendMessage(`👤 **Jerald Benny** — Digital Forensics & Cyber Analyst\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• **Academics**: M.Sc. in Forensic Science (GPA: 8.41/10) · B.Sc. Forensic Science (GPA: 7.86/10)\n• **Certifications**: Certified in Cybersecurity (CC by ISC2), CEFR C1 Advanced English\n• **Recent Publication**: *File Integrity Verifier (FIV): A Cryptographic Hash-Based Approach* in Academic Journal IASR (Oct 2026)\n• **Ecosystem Platforms**:\n  • [DigiFeed](https://jeraldbenny.github.io/digifeed/): Threat intelligence archive tracking DFIR dispatches daily.\n  • [DigiLab](https://jeraldbenny.github.io/digilab/): Browser forensic workstation (multi-hash, EXIF, email triage).\n  • [DigiPlay](https://jeraldbenny.github.io/digiplay/): 3D gamified cyber forensics investigation arena.`, 'bot');
                            return;
                        }

                        // 3. Platform Links (DigiLab / DigiPlay / DigiFeed)
                        if (lower.includes("digilab")) {
                            appendMessage(`🔬 **DigiLab Workstation**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nClient-side forensics suite featuring multi-hash cryptographic verification (MD5, SHA-1, SHA-256, SHA-512), EXIF metadata extraction, email header analyzer, and network OSINT.\n👉 [Launch DigiLab](https://jeraldbenny.github.io/digilab/)`, 'bot');
                            return;
                        }
                        if (lower.includes("digiplay")) {
                            appendMessage(`🎮 **DigiPlay 3D Forensics Arena**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nInteractive WebGL 3D cyber forensics investigation arena with 3D crime scene evidence examination, cyber forensic quiz battles, and puzzle CTF challenges.\n👉 [Launch DigiPlay](https://jeraldbenny.github.io/digiplay/)`, 'bot');
                            return;
                        }

                        // 4. Intelligence & News Search via local data.json
                        const jsonPath = window.location.pathname.includes('/digifeed') ? 'data.json' : '/digifeed/data.json';
                        const fallbackResp = await fetch(jsonPath);
                        if (fallbackResp.ok) {
                            const fData = await fallbackResp.json();
                            const articles = fData.articles || [];

                            // Parse requested count (e.g. "top 10", "5 items")
                            const countMatch = lower.match(/(?:top|show|give me|list|latest|get)\s+(\d+)/i) || lower.match(/(\d+)\s+(?:items|articles|stories|news|dfir|cves)/i);
                            const requestedCount = countMatch && countMatch[1] ? Math.min(Math.max(parseInt(countMatch[1], 10), 1), 15) : 6;

                            let matches = articles;
                            let categoryHeader = "VERIFIED DISPATCHES";

                            if (lower.includes("dfir") || lower.includes("digital forensic")) {
                                matches = articles.filter(a => (a.category_tag || "").toLowerCase().includes("dfir") || (a.title || "").toLowerCase().includes("dfir") || (a.title || "").toLowerCase().includes("forensic"));
                                categoryHeader = "DFIR & DIGITAL FORENSICS";
                            } else if (lower.includes("malware") || lower.includes("ransomware")) {
                                matches = articles.filter(a => (a.category_tag || "").toLowerCase().includes("malware") || (a.title || "").toLowerCase().includes("malware") || (a.title || "").toLowerCase().includes("ransomware"));
                                categoryHeader = "MALWARE INTELLIGENCE";
                            } else if (lower.includes("cve") || lower.includes("vulnerab") || lower.includes("flaw")) {
                                matches = articles.filter(a => (a.category_tag || "").toLowerCase().includes("cve") || (a.title || "").toLowerCase().includes("cve") || (a.title || "").toLowerCase().includes("vulnerab"));
                                categoryHeader = "CVE & VULNERABILITIES";
                            } else if (lower.includes("paper") || lower.includes("research") || lower.includes("journal")) {
                                matches = articles.filter(a => (a.category_tag || "").toLowerCase().includes("research") || (a.title || "").toLowerCase().includes("paper") || (a.title || "").toLowerCase().includes("arxiv"));
                                categoryHeader = "RESEARCH PAPERS";
                            } else if (lower.includes("tool") || lower.includes("release")) {
                                matches = articles.filter(a => (a.category_tag || "").toLowerCase().includes("release") || (a.category_tag || "").toLowerCase().includes("tool"));
                                categoryHeader = "SECURITY TOOLS & RELEASES";
                            } else {
                                // Keyword search
                                const terms = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3 && !["what", "when", "where", "which", "about", "today", "news", "show", "give"].includes(w));
                                if (terms.length > 0) {
                                    const scored = articles.map(a => {
                                        const text = ((a.title || "") + " " + (a.plain_summary || "")).toLowerCase();
                                        const score = terms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
                                        return { article: a, score };
                                    }).filter(s => s.score > 0);
                                    if (scored.length > 0) {
                                        scored.sort((a, b) => b.score - a.score);
                                        matches = scored.map(s => s.article);
                                    }
                                }
                            }

                            if (!matches || matches.length === 0) matches = articles;

                            const topArticles = matches.slice(0, requestedCount);
                            let reply = `📡 **DIGIFEED ${categoryHeader}**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                            topArticles.forEach(a => {
                                const cleanTitle = (a.title || "Headline").replace(/^\[[^\]]+\]\s*/, "");
                                const link = (a.link && !a.link.includes("news.google.com/rss/articles/")) ? a.link : "https://jeraldbenny.github.io/digifeed/";
                                const date = (a.published_fmt || "Recent").replace(/20(\d\d)/g, "$1");
                                const desc = (a.plain_summary || "").slice(0, 190);
                                reply += `• **${date}** — [${cleanTitle}](${link}): ${desc}\n\n`;
                            });
                            appendMessage(reply.trim(), 'bot');
                            return;
                        }
                    } catch (fbErr) {
                        console.warn("Client fallback failed:", fbErr);
                    }

                    appendMessage(`📡 **DigiBot Terminal**: Verified dispatches are available directly in [DigiFeed](https://jeraldbenny.github.io/digifeed/). You can also test digital artifacts in [DigiLab](https://jeraldbenny.github.io/digilab/).`, 'bot');
                    return;
                }

                const contentType = response.headers.get("content-type") || "";

                if (contentType.includes("text/event-stream") && response.body) {
                    if (suggestionsDiv) suggestionsDiv.style.display = 'none';
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'jb-msg bot';
                    historyArea.appendChild(msgDiv);

                    let accumulated = "";
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let done = false;
                    let buffer = "";

                    while (!done) {
                        const { value, done: readerDone } = await reader.read();
                        done = readerDone;
                        if (value) {
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop(); // Keep incomplete line

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed.startsWith('data:')) {
                                    const dataStr = trimmed.slice(5).trim();
                                    if (dataStr === '[DONE]') continue;
                                    try {
                                        const parsed = JSON.parse(dataStr);
                                        const token = parsed.response || parsed.choices?.[0]?.delta?.content || "";
                                        accumulated += token;
                                        msgDiv.innerHTML = parseMarkdown(accumulated);
                                        historyArea.scrollTop = historyArea.scrollHeight;
                                    } catch (e) {}
                                }
                            }
                        }
                    }

                    if (buffer.trim().startsWith('data:')) {
                        const dataStr = buffer.trim().slice(5).trim();
                        if (dataStr !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(dataStr);
                                const token = parsed.response || parsed.choices?.[0]?.delta?.content || "";
                                accumulated += token;
                            } catch (e) {}
                        }
                    }

                    if (!accumulated.trim()) {
                        accumulated = "Intelligence dispatch retrieved successfully.";
                    }

                    msgDiv.innerHTML = parseMarkdown(accumulated);

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'jb-copy-btn';
                    copyBtn.innerHTML = '⎘';
                    copyBtn.title = "Copy to clipboard";
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(accumulated);
                        copyBtn.innerHTML = '✔';
                        setTimeout(() => copyBtn.innerHTML = '⎘', 2000);
                    };
                    msgDiv.appendChild(copyBtn);

                    chatHistory.push({ role: 'assistant', content: accumulated });
                    historyArea.scrollTop = historyArea.scrollHeight;

                } else {
                    const data = await response.json();
                    const reply = data.reply || "[SYSTEM ERROR] Empty response.";
                    appendMessage(reply, 'bot');
                    chatHistory.push({ role: 'assistant', content: reply });
                }
                
            } catch (err) {
                removeTyping();
                appendMessage("[SYSTEM ERROR] Failed to transmit.", 'system');
                console.error("Bot Error:", err);
            }
        }

        sendBtn.addEventListener('click', sendMessage);
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
})();
