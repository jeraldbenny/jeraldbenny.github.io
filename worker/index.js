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

  // 2. Query Embedding via Hugging Face BAAI/bge-small-en-v1.5
  const hfEmbedUrl = "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5";
  let embedRes = await fetch(hfEmbedUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.HF_TOKEN}`,
      "Content-Type": "application/json",
      "x-use-pipeline": "feature-extraction"
    },
    body: JSON.stringify({ inputs: cleanMsg })
  });
  
  if (!embedRes.ok) {
    const errText = await embedRes.text();
    throw new Error(`Embedding API Error ${embedRes.status}: ${errText}`);
  }
  const embedding = await embedRes.json();

  // 3. Query Pinecone Vector DB
  const pcHost = await getPineconeHost(env);
  if (!pcHost || !env.PINECONE_API_KEY) {
    throw new Error(`Missing Pinecone host configuration.`);
  }

  const pineconeTopK = Math.min(Math.max(targetCount, 5), 12);
  let pcRes = await fetch(`https://${pcHost}/query`, {
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

  if (!pcRes.ok) {
    const errText = await pcRes.text();
    throw new Error(`Pinecone API Error ${pcRes.status}: ${errText}`);
  }
  const pcData = await pcRes.json();

  let contextArticles = [];
  if (pcData.matches && pcData.matches.length > 0) {
    for (let i = 0; i < pcData.matches.length; i++) {
      const m = pcData.matches[i];
      if (m.metadata && (m.metadata.content || m.metadata.plain_summary)) {
        const title = m.metadata.title || "Untitled Intelligence";
        let date = m.metadata.date || "Recent";
        date = date.replace(/20(\d\d)/g, "$1");
        const category = m.metadata.category || m.metadata.category_tag || "General";
        const link = m.metadata.link || "https://jeraldbenny.github.io/digifeed/";
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

  if (isTodayNewsQuery) {
    const feedData = await fetchCachedJson("https://jeraldbenny.github.io/digifeed/data.json", ctx, 300);
    if (feedData) {
      let candidateArticles = feedData.articles || [];
      if (targetCategory) {
        const catMatches = candidateArticles.filter(a => a.category_tag === targetCategory);
        if (catMatches.length > 0) {
          if (topicKeywords.length > 0) {
            const scored = catMatches.map(a => {
              const text = (a.title + " " + (a.plain_summary || "") + " " + (a.source || "")).toLowerCase();
              const score = topicKeywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
              return { article: a, score };
            });
            scored.sort((a, b) => b.score - a.score);
            candidateArticles = scored.map(s => s.article);
          } else {
            candidateArticles = catMatches;
          }
        } else {
          candidateArticles = candidateArticles.filter(a => {
            const text = (a.title + " " + (a.plain_summary || "") + " " + (a.source || "")).toLowerCase();
            return topicKeywords.some(kw => text.includes(kw));
          });
        }
      }

      const todayArticles = candidateArticles.slice(0, targetCount);
      let liveArticlesList = [];
      for (const a of todayArticles) {
        const aTitle = a.title || "Headline";
        const aLink = a.link || "https://jeraldbenny.github.io/digifeed/";
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
  }

  const contextText = contextArticles.join("\n\n---\n\n");

  // 5. Build System Prompt & Multi-turn Message Payload
  const systemPrompt = `You are DIGIBOT, the digital forensics & cybersecurity AI assistant for DigiFeed intelligence archive.
You answer user questions strictly using the verified facts in the Context Articles below.

CURRENT SYSTEM TIME & STATUS:
- Real-time Today Date (UTC): ${todayUTCStr} (${todayUTCShort})
- Current Clock: ${timeUTCStr} UTC
- Global Timezone Standard: UTC (Always maintain UTC timestamps and dates in your replies)
${liveStatusInfo}

MANDATORY CITATION & FORMATTING RULES:
1. CITATION & HYPERLINK PATTERN:
   - For EVERY news item, vulnerability, tool release, or security alert you mention, you MUST hyperlink the headline directly to its reference URL.
   - Do NOT write a separate "(Source: ...)" or "(Reference: ...)" at the end. The link MUST be on the headline itself.
   - Date format MUST be "DD Mon YY" (e.g. "${todayUTCShort}"). Do not put brackets around the date. Do not use 4-digit years.
   - After the hyperlinked headline, provide a 1-2 sentence summary of what happened or the key forensic/security takeaway from the article.
   - Example format:
     • **${todayUTCShort}** — [Headline Name](URL): Clear summary of the specific event, threat impact, or tool capabilities.

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
   - When asked for "today's news", "todays latest news", "latest news", "top forensic news", "forensics", "top dfir news", "cves", "malware", or "daily briefing": state the date (${todayUTCShort}) and list the items strictly from the relevant [TODAY'S VERIFIED DISPATCHES] or context. NEVER cite old historical articles from earlier months or days unless specifically queried.

5. JERALD BENNY QUERIES (STRICT RULE):
   - ONLY mention Jerald Benny if the user explicitly asks about Jerald Benny, who created this, author, creator, or who made DigiBot/DigiFeed.
   - NEVER include or append a "Jerald Benny Background" section to general news, search, or technical queries.

6. GROUNDING & COMPLETION INTEGRITY:
   - Do not invent facts, dates, or URLs not present in the context.
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

  // 6. Multi-Model Fallback Execution
  const hfChatUrl = "https://router.huggingface.co/v1/chat/completions";
  let lastError = null;

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
          max_tokens: 1500,
          temperature: 0.25,
          stream: wantStream
        })
      });

      if (!chatRes.ok) {
        const errText = await chatRes.text();
        lastError = new Error(`HF Model ${model} returned ${chatRes.status}: ${errText}`);
        continue; // Try next model
      }

      if (wantStream) {
        return chatRes; // Return streaming response object directly
      }

      const chatData = await chatRes.json();
      if (chatData.choices && chatData.choices[0] && chatData.choices[0].message) {
        return chatData.choices[0].message.content.trim();
      } else if (chatData.error) {
        lastError = new Error(`Model error: ${JSON.stringify(chatData.error)}`);
        continue;
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("All language model fallbacks failed.");
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

        const botToken = env.TELEGRAM_BOT_TOKEN || "8830406849:AAF5vunUjZULM7Lr3eGiweODP0s4l7_ExG0";
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
        await sendTelegram(botToken, chatId, reply);

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
