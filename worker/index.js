/**
 * JB:INTEL-BOT Secure API Bridge (Cloudflare Worker)
 * 
 * Proxies requests from frontend widget & Telegram webhook to:
 * 1. Hugging Face Inference API (embeddings & chat generation with multi-model fallback & SSE streaming)
 * 2. Pinecone Vector DB (retrieving relevant DFIR dispatches & dynamic briefing context)
 * 3. Telegram Bot API (for two-way interactive personal assistant)
 */

const FALLBACK_MODELS = [
  "Qwen/Qwen2.5-Coder-32B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct"
];

// Helper: send Telegram message
async function sendTelegram(botToken, chatId, text) {
  if (!botToken || !chatId) return;
  const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(tgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      })
    });
    if (!res.ok) {
      await fetch(tgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          disable_web_page_preview: true
        })
      });
    }
  } catch (e) {}
}

// Helper: clean and shorten URLs before giving to LLM to prevent base64 token loops
function cleanArticleUrl(url) {
  if (!url || typeof url !== "string") return "https://jeraldbenny.github.io/digifeed/";
  if (url.includes("news.google.com/rss/articles/")) {
    return "https://jeraldbenny.github.io/digifeed/";
  }
  return url;
}

// Helper: post-process and sanitize bot replies to ensure 100% hyperlink integrity
function sanitizeBotReply(text) {
  if (!text) return "";
  // 1. Cut off severe repetition loops (e.g. 5+ repeats of identical token/word sequence)
  text = text.replace(/(.{4,35}?)\1{5,}/gs, "$1");
  // 2. Fix broken markdown links where [Title] and (URL) are separated by spaces or newlines
  text = text.replace(/\[([^\]\r\n]+)\][\s\r\n]*\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, "[$1]($2)");
  // 3. Fix nested brackets [[Tag] Title](URL) -> [Tag: Title](URL)
  text = text.replace(/\[\[([^\]]+)\]\s*([^\]]+)\][\s\r\n]*\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, "[$1: $2]($3)");
  text = text.replace(/\[([^\]\n]+)\]\s*([^\]\n]+)\][\s\r\n]*\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, "[$1: $2]($3)");
  // 4. Sanitize any remaining Google News base64 tracking redirect URLs into clean DigiFeed URLs
  text = text.replace(/https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_\-\+]+(?:\?[^\s\)]+)?/g, "https://jeraldbenny.github.io/digifeed/");
  return text.trim();
}

// Helper: edge-cached JSON fetch with 5-minute TTL
async function fetchCachedJson(url, ctx, ttl = 300) {
  try {
    if (typeof caches !== 'undefined' && caches.default) {
      const cache = caches.default;
      const cacheKey = new Request(url, { method: "GET" });
      const cachedResp = await cache.match(cacheKey);
      if (cachedResp) {
        return await cachedResp.json();
      }
      const fresh = await fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true } });
      if (fresh.ok) {
        const clone = fresh.clone();
        const headers = new Headers(clone.headers);
        headers.set("Cache-Control", `public, max-age=${ttl}`);
        const toCache = new Response(clone.body, { status: clone.status, statusText: clone.statusText, headers });
        if (ctx && ctx.waitUntil) {
          ctx.waitUntil(cache.put(cacheKey, toCache));
        }
        return await fresh.json();
      }
    }
  } catch (e) {}
  try {
    const direct = await fetch(url);
    if (direct.ok) return await direct.json();
  } catch (e) {}
  return null;
}

// Helper: resolve Pinecone host
async function getPineconeHost(env) {
  let pcHost = env.PINECONE_HOST || "";
  if (!pcHost && env.PINECONE_API_KEY) {
    try {
      const idxRes = await fetch("https://api.pinecone.io/indexes/digifeed-rag", {
        headers: { "Api-Key": env.PINECONE_API_KEY }
      });
      if (idxRes.ok) {
        const idxData = await idxRes.json();
        pcHost = idxData.host || "";
      }
    } catch (e) {}
  }
  if (pcHost) {
    pcHost = pcHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
  return pcHost;
}

// Helper: core RAG & reasoning pipeline
async function generateIntelligence(cleanMsg, history, env, ctx, wantStream = false) {
  const lowerMsg = cleanMsg.toLowerCase();

  // 1. Parse User Query Intent: Count & Category Routing
  let targetCount = 6;
  const countMatch = lowerMsg.match(/(?:top|show|give me|list|latest|get)\s+(\d+)/i) || 
                     lowerMsg.match(/(\d+)\s+(?:forensic|dfir|news|cve|malware|items|articles|stories|headlines|releases)/i);
  if (countMatch && countMatch[1]) {
    const parsed = parseInt(countMatch[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      targetCount = Math.min(Math.max(parsed, 1), 15);
    }
  }

  let targetCategory = null;
  let topicKeywords = [];

  if (lowerMsg.includes("digital forensic") || lowerMsg.includes("dfir") || lowerMsg.includes("incident response")) {
    targetCategory = "DFIR Articles";
    topicKeywords = ["dfir", "digital forensic", "incident", "investigat", "breach", "threat"];
  } else if (lowerMsg.includes("forensic") || lowerMsg.includes("autopsy") || lowerMsg.includes("toxicology") || lowerMsg.includes("dna profiling")) {
    targetCategory = "Forensics";
    topicKeywords = ["forensic", "dna", "crime", "investig", "autopsy", "police", "identif", "lab", "toxicology"];
  } else if (lowerMsg.includes("malware") || lowerMsg.includes("ransomware") || lowerMsg.includes("trojan") || lowerMsg.includes("stealer")) {
    targetCategory = "Malware Intelligence";
    topicKeywords = ["malware", "ransomware", "trojan", "stealer", "infostealer", "c2", "payload"];
  } else if (lowerMsg.includes("cve") || lowerMsg.includes("vulnerabilit") || lowerMsg.includes("zero-day") || lowerMsg.includes("0-day") || lowerMsg.includes("exploit") || lowerMsg.includes("flaw")) {
    targetCategory = "CVE & Vulnerabilities";
    topicKeywords = ["cve", "vulnerab", "exploit", "zero-day", "flaw", "patch"];
  } else if (lowerMsg.includes("ioc") || lowerMsg.includes("indicator") || lowerMsg.includes("threat feed")) {
    targetCategory = "IOC Feed";
    topicKeywords = ["ioc", "ip", "domain", "hash", "indicator"];
  } else if (lowerMsg.includes("tool") || lowerMsg.includes("release") || lowerMsg.includes("github")) {
    targetCategory = "GitHub Releases";
    topicKeywords = ["release", "tool", "github", "v1.", "v2.", "v0."];
  } else if (lowerMsg.includes("paper") || lowerMsg.includes("research") || lowerMsg.includes("journal")) {
    targetCategory = "Research Papers";
    topicKeywords = ["paper", "research", "arxiv", "journal", "study"];
  }

  // 2. Query Embedding via Cloudflare Workers AI or Hugging Face
  let embedText = cleanMsg;
  if (Array.isArray(history) && history.length > 0) {
    const lastUserTurn = [...history].reverse().find(h => h && (h.role === "user" || !h.role));
    if (lastUserTurn && lastUserTurn.content) {
      embedText = `${lastUserTurn.content.slice(0, 200)} ${cleanMsg}`;
    }
  }

  let contextArticles = [];

  try {
    let embedding = null;

    // Check Cloudflare Workers AI first
    if (env.AI && typeof env.AI.run === "function") {
      try {
        const aiEmbedRes = await env.AI.run("@cf/baai/bge-small-en-v1.5", { text: [embedText] });
        if (aiEmbedRes && aiEmbedRes.data && aiEmbedRes.data[0]) {
          embedding = aiEmbedRes.data[0];
        }
      } catch (e) {
        console.warn("Workers AI embedding error:", e);
      }
    }

    // Fallback to Hugging Face
    if (!embedding && env.HF_TOKEN) {
      try {
        const hfEmbedUrl = "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5";
        const embedRes = await fetch(hfEmbedUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
            "x-use-pipeline": "feature-extraction"
          },
          body: JSON.stringify({ inputs: embedText })
        });
        if (embedRes.ok) {
          embedding = await embedRes.json();
        }
      } catch (e) {
        console.warn("Hugging Face embedding error:", e);
      }
    }

    // 3. Query Pinecone Vector DB if embedding is available
    if (embedding && Array.isArray(embedding)) {
      const pcHost = await getPineconeHost(env);
      if (pcHost && env.PINECONE_API_KEY) {
        const pineconeTopK = Math.min(Math.max(targetCount, 5), 12);
        const pcRes = await fetch(`https://${pcHost}/query`, {
          method: "POST",
          headers: {
            "Api-Key": env.PINECONE_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            vector: embedding,
            topK: pineconeTopK,
            includeMetadata: true
          })
        });

        if (pcRes.ok) {
          const pcData = await pcRes.json();
          if (pcData.matches && pcData.matches.length > 0) {
            for (let i = 0; i < pcData.matches.length; i++) {
              const m = pcData.matches[i];
              if (m.metadata && (m.metadata.content || m.metadata.plain_summary)) {
                let title = m.metadata.title || "Untitled Intelligence";
                title = title.replace(/^\[Research Paper\]\s*/i, "Research Paper: ");
                title = title.replace(/^\[([^\]]+)\]\s*/, "$1: ");
                title = title.replace(/[\[\]]/g, "");
                let date = m.metadata.date || "Recent";
                date = date.replace(/20(\d\d)/g, "$1");
                const category = m.metadata.category || m.metadata.category_tag || "General";
                const link = cleanArticleUrl(m.metadata.link);
                const content = m.metadata.content || m.metadata.plain_summary || "";
                contextArticles.push(`[ARTICLE ${i + 1}: ${title}]
- Published Date: ${date}
- Category: ${category}
- Reference URL: ${link}
- Intelligence Content:
${content}`);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Vector search failed, proceeding with direct feed data matching:", err);
  }

  // 4. Determine Current Date in UTC & Live System Status
  const now = new Date();
  const utcFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const utcTimeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  const todayUTCStr = utcFormatter.format(now);
  const todayUTCShort = todayUTCStr.replace("2026", "26").replace("2025", "25").replace("2024", "24");
  const timeUTCStr = utcTimeFormatter.format(now);

  const isUpdateQuery = lowerMsg.includes("last update") || 
                        lowerMsg.includes("updated") || 
                        lowerMsg.includes("what is today's date") || 
                        lowerMsg.includes("current date") || 
                        lowerMsg.includes("what date") || 
                        lowerMsg.includes("when were you last") || 
                        lowerMsg.includes("system status");

  const isTodayNewsQuery = lowerMsg.includes("today") || 
                           lowerMsg.includes("latest") || 
                           lowerMsg.includes("news") || 
                           lowerMsg.includes("daily") || 
                           lowerMsg.includes("top") || 
                           lowerMsg.includes("briefing") || 
                           lowerMsg.includes("stories") || 
                           lowerMsg.includes("headlines") || 
                           lowerMsg.includes("what's new") || 
                           lowerMsg.includes("whats new") || 
                           targetCategory !== null;

  let liveStatusInfo = "";
  if (isUpdateQuery || isTodayNewsQuery) {
    const sData = await fetchCachedJson("https://jeraldbenny.github.io/digifeed/digibot_status.json", ctx, 300);
    if (sData) {
      const syncTimestamp = sData.last_sync_utc || sData.last_sync || todayUTCStr;
      liveStatusInfo = `\n[VERIFIED LIVE SYSTEM STATUS]
- Real-Time Today Date (UTC): ${todayUTCStr}
- System Last Synchronized: ${syncTimestamp}
- Total Vectors: ${sData.total_vectors || '1,000+'}
- Active Feed Dispatches: ${sData.active_dispatches || 'Active'}
- Status: ${sData.status || 'ONLINE / SYNCED'}
- Ingestion Engine: ${sData.embedding_engine || 'FastEmbed ONNX Runtime'}
- Instruction: When responding to update date or system status queries, state this verified synchronization status in UTC and today's date (${todayUTCShort}). Do NOT cite old dispatches or random articles.`;
    }
  }

  // Always fetch feedData from edge cache (0ms overhead)
  const feedData = await fetchCachedJson("https://jeraldbenny.github.io/digifeed/data.json", ctx, 300);
  let candidateArticles = [];
  if (feedData) {
    candidateArticles = feedData.articles || [];
    if (targetCategory) {
      const catMatches = candidateArticles.filter(a => a.category_tag === targetCategory);
      if (catMatches.length > 0) {
        const todayDayMonth = todayUTCShort.slice(0, 6).toLowerCase();
        const scored = catMatches.map(a => {
          const text = (a.title + " " + (a.plain_summary || "") + " " + (a.source || "")).toLowerCase();
          const kwScore = topicKeywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
          const isRecent = (a.published_fmt || "").toLowerCase().includes(todayDayMonth) ? 10 : 0;
          return { article: a, score: isRecent + kwScore };
        });
        scored.sort((a, b) => b.score - a.score);
        candidateArticles = scored.map(s => s.article);
      } else {
        candidateArticles = candidateArticles.filter(a => {
          const text = (a.title + " " + (a.plain_summary || "") + " " + (a.source || "")).toLowerCase();
          return topicKeywords.some(kw => text.includes(kw));
        });
      }
    } else {
      // Keyword matching from cleanMsg and history
      const searchTerms = [];
      const extractWords = (str) => (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3 && !["what", "when", "where", "which", "about", "there", "their", "exact", "number", "mentioned", "today", "yesterday", "could", "would"].includes(w));
      searchTerms.push(...extractWords(cleanMsg));
      if (Array.isArray(history)) {
        for (const h of history.slice(-2)) {
          searchTerms.push(...extractWords(h.content));
        }
      }
      if (searchTerms.length > 0) {
        const scored = candidateArticles.map(a => {
          const text = (a.title + " " + (a.plain_summary || "")).toLowerCase();
          const score = searchTerms.reduce((acc, term) => acc + (text.includes(term) ? 1 : 0), 0);
          return { article: a, score };
        }).filter(s => s.score > 0);
        if (scored.length > 0) {
          scored.sort((a, b) => b.score - a.score);
          candidateArticles = scored.map(s => s.article);
        }
      }
    }

    const todayArticles = candidateArticles.slice(0, targetCount);
    let liveArticlesList = [];
    for (const a of todayArticles) {
      let aTitle = a.title || "Headline";
      aTitle = aTitle.replace(/^\[Research Paper\]\s*/i, "Research Paper: ");
      aTitle = aTitle.replace(/^\[([^\]]+)\]\s*/, "$1: ");
      aTitle = aTitle.replace(/[\[\]]/g, "");
      const aLink = cleanArticleUrl(a.link);
      let aDate = a.published_fmt || todayUTCShort;
      aDate = aDate.replace(/20(\d\d)/g, "$1");
      const aSummary = a.plain_summary || a.deep_lore || "";
      liveArticlesList.push(`• **${aDate}** — [${aTitle}](${aLink}): ${aSummary.slice(0, 250)}`);
    }
    if (liveArticlesList.length > 0) {
      const catHeader = targetCategory ? `VERIFIED ${targetCategory.toUpperCase()} DISPATCHES` : "VERIFIED LIVE INTELLIGENCE DISPATCHES";
      contextArticles.unshift(`[TODAY'S ${catHeader} (${todayUTCStr})]
${liveArticlesList.join("\n\n")}`);
    }
  }

  const contextText = contextArticles.join("\n\n---\n\n");

  // 5. Build System Prompt & Multi-turn Message Payload
  const systemPrompt = `You are DIGIBOT, the digital forensics & cybersecurity AI assistant for DigiFeed intelligence archive.

ECOSYSTEM & PLATFORM KNOWLEDGE:
- DigiFeed (https://jeraldbenny.github.io/digifeed/): Jerald Benny's automated threat intelligence hub, tracking daily DFIR articles, research papers, tool releases, malware intelligence, IOC feeds, and CVEs.
- DigiLab (https://jeraldbenny.github.io/digilab/): Jerald Benny's browser-based digital forensics workstation featuring multi-hash verification (MD5, SHA-1, SHA-256, SHA-512), EXIF metadata & GPS extraction, email header analyzer, and network OSINT.
- DigiPlay (https://jeraldbenny.github.io/digiplay/): Jerald Benny's interactive 3D digital forensics playground and gamified CTF arena. Features 3D crime scene evidence examination (Three.js WebGL simulation), cyber forensic quiz battles, and investigative puzzle solving. (Note: DigiBot does not appear inside DigiPlay to keep the 3D gaming screen unobstructed, but DigiBot is fully aware of DigiPlay and can answer user questions about it).

CONVERSATION MEMORY & MULTI-TURN RULES:
- When the user asks a follow-up question or references prior conversation turns (e.g., asking "what was the exact number mentioned?", "who wrote that?", "explain that flaw", "why?", or referencing entities, names, or counts discussed previously), ALWAYS consult the prior conversation turns in the chat history.
- If the requested information is in the conversation history (such as a number, count, name, or detail previously stated by you or the user), answer directly and concisely based on that conversation history!
- Never claim that "the context articles do not mention..." if the user is asking about something already stated in the prior conversation turns.

CURRENT SYSTEM TIME & STATUS:
- Real-time Today Date (UTC): ${todayUTCStr} (${todayUTCShort})
- Current Clock: ${timeUTCStr} UTC
- Global Timezone Standard: UTC (Always maintain UTC timestamps and dates in your replies)
${liveStatusInfo}

MANDATORY CITATION & FORMATTING RULES:
1. CITATION & HYPERLINK INTEGRITY (CRITICAL):
   - For ANY and EVERY news item, vulnerability, tool release, research paper, or security alert: NEVER display the raw URL as text. The link MUST be embedded directly in the headline title: [Headline Name](URL).
   - STRICT SYNTAX: [Headline](URL) with NO space and NO newline between ']' and '('. The '(' MUST touch ']'.
   - NEVER write [Headline] (URL) or [Headline]
(URL). Keep [Headline](URL) strictly together on the same line.
   - When clicked, the headline title must redirect directly to the article URL.
   - NEVER put square brackets inside the headline title. Write [Research Paper: Title](URL) or [Title](URL), NEVER [[Tag] Title](URL) or [Tag] Title](URL).
   - Do NOT write a separate "(Source: ...)" or "(Reference: ...)" at the end. The link MUST be on the headline itself.
   - Date format MUST be "DD Mon YY" (e.g. "${todayUTCShort}"). Do not put brackets around the date. Do not use 4-digit years.
   - After the hyperlinked headline, provide a 1-2 sentence summary of what happened or the key forensic/security takeaway from the article.
   - Example format:
     • **${todayUTCShort}** — [Research Paper: Zero-Shot Audio Deepfake Detection](https://arxiv.org/abs/...): Clear summary of the specific event or research.

2. LIST FORMATTING & LINE BREAKS (CRITICAL):
   - You MUST place a blank line (double newline) between EVERY bullet item in any list. NEVER run items together on the same line.
   - Example:
     • **${todayUTCShort}** — [Headline One](URL): Summary one.

     • **${todayUTCShort}** — [Headline Two](URL): Summary two.

     • **${todayUTCShort}** — [Headline Three](URL): Summary three.

3. ITEM COUNT FIDELITY:
   - When the user asks for a specific number of items (e.g., "top 10", "top 5", "3 items"), you MUST provide exactly that requested count of distinct items if present in the context. Do not truncate early or provide fewer unless context has fewer.

4. TODAY'S NEWS & CURRENT DATE QUERIES:
   - When asked "when were you last updated?", "what is today's date", "current date", or "system status": answer directly with the verified live status (${todayUTCShort}) in UTC and state the system is synchronized. NEVER answer with random old articles.
   - When asked for "today's news", "todays latest news", "latest news", "top forensic news", "forensics", "top dfir news", "cves", "malware", or "daily briefing": state the date (${todayUTCShort}) and list the items from the relevant [TODAY'S VERIFIED DISPATCHES] or context. Prioritize the newest items from today. When the user asks for a specific count (such as top 10, top 5, 3 items), provide the full requested count of distinct items from the verified dispatches. Do not truncate the list early.

5. JERALD BENNY QUERIES (STRICT RULE):
   - ONLY mention Jerald Benny if the user explicitly asks about Jerald Benny, who created this, author, creator, or who made DigiBot/DigiFeed/DigiLab/DigiPlay.
   - NEVER include or append a "Jerald Benny Background" section to general news, search, or technical queries.

6. GROUNDING & COMPLETION INTEGRITY:
   - When answering follow-ups or referencing earlier statements, use the facts in the chat history.
   - For new claims or citations, do not invent facts, dates, or URLs not present in the context.
   - Never cut off links or sentences mid-way. Complete every headline link and sentence cleanly.

=== CONTEXT ARTICLES ===
${contextText || "No matching articles found in index."}
`;

  const messages = [{ role: "system", content: systemPrompt }];
  if (Array.isArray(history)) {
    for (const h of history.slice(-6)) {
      if (h && h.role && h.content) {
        const r = h.role === "assistant" || h.role === "bot" ? "assistant" : "user";
        messages.push({ role: r, content: String(h.content).slice(0, 1200) });
      }
    }
  }
  if (messages[messages.length - 1].content !== cleanMsg) {
    messages.push({ role: "user", content: cleanMsg });
  }

  // 6. Multi-Tier Language Model & Resilient Fallback Execution
  // Tier 1: Cloudflare Workers AI (Fast, Free Native Inference, 0 Hugging Face Credits)
  const CF_AI_MODELS = [
    "@cf/meta/llama-3.2-3b-instruct",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.2-1b-instruct"
  ];

  if (env.AI && typeof env.AI.run === "function") {
    for (const cfModel of CF_AI_MODELS) {
      try {
        if (wantStream) {
          const stream = await env.AI.run(cfModel, {
            messages: messages,
            max_tokens: 2048,
            temperature: 0.25,
            stream: true
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive"
            }
          });
        } else {
          const aiRes = await env.AI.run(cfModel, {
            messages: messages,
            max_tokens: 2048,
            temperature: 0.25
          });
          if (aiRes && aiRes.response) {
            return sanitizeBotReply(aiRes.response);
          }
        }
      } catch (e) {
        console.warn(`Workers AI model ${cfModel} failed:`, e);
      }
    }
  }

  // Tier 2: Hugging Face Serverless Router (if credits/token available)
  if (env.HF_TOKEN) {
    const hfChatUrl = "https://router.huggingface.co/v1/chat/completions";
    for (const model of FALLBACK_MODELS) {
      try {
        const chatRes = await fetch(hfChatUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: 2500,
            temperature: 0.25,
            stream: wantStream
          })
        });

        if (chatRes.ok) {
          if (wantStream) {
            return chatRes; // Return streaming response object directly
          }
          const chatData = await chatRes.json();
          if (chatData.choices && chatData.choices[0] && chatData.choices[0].message) {
            return sanitizeBotReply(chatData.choices[0].message.content);
          }
        }
      } catch (e) {
        console.warn(`HF Model ${model} failed:`, e);
      }
    }
  }

  // Tier 3: Zero-Crash Resilient Intelligence Fallback
  // If external AI inference is out of credits or unreachable, provide verified live intelligence
  const rawFallback = generateSmartFallback(cleanMsg, history, contextArticles, todayUTCStr, todayUTCShort, targetCategory, targetCount, candidateArticles);
  const fallbackText = sanitizeBotReply(rawFallback);

  if (wantStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const payload = JSON.stringify({ choices: [{ delta: { content: fallbackText } }] });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  return fallbackText;
}

// Resilient Fallback Intelligence Generator
function generateSmartFallback(cleanMsg, history, contextArticles, todayUTCStr, todayUTCShort, targetCategory, targetCount, candidateArticles) {
  const lowerMsg = cleanMsg.toLowerCase();

  // 1. System status or date queries
  if (lowerMsg.includes("date") || lowerMsg.includes("status") || lowerMsg.includes("updated") || lowerMsg.includes("last sync")) {
    return `🤖 **DIGIBOT SYSTEM STATUS**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• **Current Date**: ${todayUTCStr} (${todayUTCShort})\n• **Platform Status**: ONLINE / OPERATIONAL\n• **Threat Feed**: Synchronized with DigiFeed Archive\n• **Security Protocol**: Strict UTC Timestamps\n\nDigiBot is operational and connected to the live cyber intelligence repository. What would you like to investigate?`;
  }

  // 2. Questions about Jerald Benny
  if (lowerMsg.includes("jerald") || lowerMsg.includes("who are you") || lowerMsg.includes("creator") || lowerMsg.includes("author") || lowerMsg.includes("who made")) {
    return `👤 **JERALD BENNY** — *Digital Forensics & Cyber Analyst*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• **Specialization**: Digital Forensics, DFIR, Volatile Memory & Disk Acquisition, Explainable AI for Deepfake Detection.\n• **Academics**: M.Sc. Forensic Science (GPA: 8.41/10) · B.Sc. Forensic Science (GPA: 7.86/10).\n• **Certifications**: Certified in Cybersecurity (CC by ISC2), CEFR C1 Advanced English.\n• **Recent Publication**: *File Integrity Verifier (FIV): A Cryptographic Hash-Based Approach* in Academic Journal IASR (Oct 2026).\n• **Ecosystem Platforms**:\n  • [DigiFeed](https://jeraldbenny.github.io/digifeed/): Automated threat intelligence & research aggregator.\n  • [DigiLab](https://jeraldbenny.github.io/digilab/): Browser workstation for cryptographic hashing, EXIF forensics, and email headers.\n  • [DigiPlay](https://jeraldbenny.github.io/digiplay/): 3D gamified cyber forensics investigation arena.`;
  }

  // 3. Questions about DigiLab / DigiPlay / DigiFeed
  if (lowerMsg.includes("digilab")) {
    return `🔬 **DIGILAB FORENSIC WORKSTATION**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[DigiLab](https://jeraldbenny.github.io/digilab/) is a browser-based forensic investigation suite built by Jerald Benny featuring:\n• Multi-hash cryptographic verification (MD5, SHA-1, SHA-256, SHA-512)\n• EXIF metadata extraction & GPS coordinate mapping\n• Email header analyzer for SPF, DKIM, and spoofing detection\n• Network OSINT and threat indicator triaging.`;
  }
  if (lowerMsg.includes("digiplay")) {
    return `🎮 **DIGIPLAY 3D FORENSICS ARENA**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[DigiPlay](https://jeraldbenny.github.io/digiplay/) is an interactive WebGL 3D forensic investigation arena featuring interactive 3D crime scene examination, cyber forensic quiz battles, and investigative CTF challenges.`;
  }
  if (lowerMsg.includes("digifeed")) {
    return `📡 **DIGIFEED INTELLIGENCE ARCHIVE**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[DigiFeed](https://jeraldbenny.github.io/digifeed/) is an automated intelligence hub tracking daily DFIR articles, research papers, tool releases, malware intelligence, IOC feeds, and CVEs across verified global cybersecurity sources.`;
  }

  // 4. Intelligence and News queries
  const items = Array.isArray(candidateArticles) && candidateArticles.length > 0 ? candidateArticles.slice(0, targetCount || 6) : [];
  if (items.length > 0) {
    const catTitle = targetCategory ? targetCategory.toUpperCase() : "VERIFIED LIVE INTELLIGENCE";
    const formatted = items.map(a => {
      let title = a.title || "Dispatched Intelligence";
      title = title.replace(/^\[Research Paper\]\s*/i, "Research Paper: ");
      title = title.replace(/^\[([^\]]+)\]\s*/, "$1: ");
      title = title.replace(/[\[\]]/g, "");
      const link = cleanArticleUrl(a.link);
      const date = (a.published_fmt || todayUTCShort).replace(/20(\d\d)/g, "$1");
      const summary = a.plain_summary || a.deep_lore || "";
      return `• **${date}** — [${title}](${link}): ${summary.slice(0, 240)}`;
    }).join("\n\n");

    return `📡 **${catTitle} DISPATCHES** (${todayUTCStr})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${formatted}\n\n*Source: DigiFeed Automated Cyber Intelligence Hub*`;
  }

  return `🤖 **DIGIBOT CYBER INTELLIGENCE ASSISTANT**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOperating Date: **${todayUTCStr}**\n\nI am ready to help you explore Jerald Benny's cyber intelligence platform. You can ask me:\n• **"What are today's top DFIR articles?"**\n• **"Show latest malware reports"**\n• **"Tell me about Jerald Benny's research & publications"**\n• **"What tools are available in DigiLab?"**`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, User-Agent, Accept",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // 2. Route: Telegram Webhook (/telegram-webhook or /webhook)
    if (url.pathname === "/telegram-webhook" || url.pathname === "/webhook") {
      try {
        const update = await request.json();
        if (!update || !update.message) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        const tgMsg = update.message;
        const chatId = tgMsg.chat?.id;
        const fromId = tgMsg.from?.id;
        const rawText = (tgMsg.text || "").trim();

        const authorizedId = parseInt(env.TELEGRAM_CHAT_ID || "629509562", 10);
        if (chatId !== authorizedId && fromId !== authorizedId) {
          if (chatId && env.TELEGRAM_BOT_TOKEN) {
            await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, "⛔ *Access Denied*: This is a private DigiBot intelligence terminal.");
          }
          return new Response(JSON.stringify({ ok: true, status: "unauthorized" }), { status: 200 });
        }

        if (!rawText) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        const botToken = env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          return new Response(JSON.stringify({ error: "Missing TELEGRAM_BOT_TOKEN" }), { status: 500 });
        }

        // Handle Telegram Slash Commands
        const lowerCmd = rawText.toLowerCase();
        if (lowerCmd === "/start" || lowerCmd === "/help") {
          const menuText = `🤖 *DIGIBOT PRIVATE INTELLIGENCE TERMINAL*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Secure Link Established.

*Available Commands:*
• /today — Today's verified intelligence briefing
• /forensics — Top 10 forensic & lab dispatches
• /dfir — Top 10 incident response headlines
• /malware — Top 5 malware & ransomware reports
• /cve — Top 10 actively exploited vulnerabilities
• /status — DigiBot & vector store live health status

_Or send ANY question directly to query the RAG database!_`;
          await sendTelegram(botToken, chatId, menuText);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        let queryMsg = rawText;
        if (lowerCmd === "/today" || lowerCmd === "/briefing") queryMsg = "todays latest news";
        else if (lowerCmd === "/forensics" || lowerCmd === "/forensic") queryMsg = "top 10 forensic news of today";
        else if (lowerCmd === "/dfir") queryMsg = "top 10 dfir news of today";
        else if (lowerCmd === "/malware") queryMsg = "top 5 malware news of today";
        else if (lowerCmd === "/cve" || lowerCmd === "/cves") queryMsg = "top 10 cves of today";
        else if (lowerCmd === "/status") queryMsg = "when were you last updated and system status";

        // Generate response via DigiBot pipeline
        const reply = await generateIntelligence(queryMsg, [], env, ctx, false);
        await sendTelegram(botToken, chatId, sanitizeBotReply(reply));

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200 });
      }
    }

    // 3. Route: Web Widget Chat API
    try {
      const acceptHeader = request.headers.get("Accept") || "";
      const body = await request.json();
      const message = body.message;
      const history = body.history || [];
      const wantStream = Boolean(body.stream) || acceptHeader.includes("text/event-stream");

      if (!message || !message.trim()) {
        return new Response(JSON.stringify({ error: "Missing message" }), {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }

      const cleanMsg = message.trim();
      if (cleanMsg.toLowerCase() === "ping") {
        return new Response(JSON.stringify({ reply: "Pong. Ready to breach your queries." }), {
          headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
        });
      }

      if (cleanMsg.toLowerCase() === "debug-ai") {
        let embedStatus = "not run", chatStatus = "not run";
        try {
          if (!env.AI) {
            embedStatus = "env.AI is undefined";
          } else {
            const eRes = await env.AI.run("@cf/baai/bge-small-en-v1.5", { text: ["cybersecurity"] });
            embedStatus = eRes ? `ok (shape: ${JSON.stringify(eRes.shape)})` : "empty response";
          }
        } catch (e) {
          embedStatus = `error: ${e.message}`;
        }
        try {
          if (!env.AI) {
            chatStatus = "env.AI is undefined";
          } else {
            const cRes = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", { prompt: "Say hello in 5 words" });
            chatStatus = cRes ? `ok (response: ${cRes.response})` : "empty response";
          }
        } catch (e) {
          chatStatus = `error: ${e.message}`;
        }
        return new Response(JSON.stringify({ embedStatus, chatStatus, hasTelegramToken: Boolean(env.TELEGRAM_BOT_TOKEN) }), {
          headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" }
        });
      }

      if (wantStream) {
        const streamRes = await generateIntelligence(cleanMsg, history, env, ctx, true);
        return new Response(streamRes.body, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache"
          }
        });
      }

      const reply = await generateIntelligence(cleanMsg, history, env, ctx, false);
      return new Response(JSON.stringify({ reply }), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: `Unhandled Exception: ${err.message}` }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
