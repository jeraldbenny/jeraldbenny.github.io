/**
 * JB:INTEL-BOT Secure API Bridge (Cloudflare Worker)
 * 
 * Proxies requests from the frontend widget to:
 * 1. Hugging Face Inference API (for query embeddings and chat generation)
 * 2. Pinecone Vector DB (for retrieving relevant DFIR dispatches & dynamic briefing context)
 * 
 * Environment Variables Required in Cloudflare Worker:
 * - HF_TOKEN
 * - PINECONE_API_KEY
 * - PINECONE_HOST (e.g. digifeed-rag-xxxxx.svc.aped-4627-b74a.pinecone.io)
 */

export default {
    async fetch(request, env, ctx) {
      // 1. Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, User-Agent",
          },
        });
      }
  
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
  
      try {
        const { message, history } = await request.json();
        if (!message || !message.trim()) {
          return new Response(JSON.stringify({ error: "Missing message" }), { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
        }

        const cleanMsg = message.trim();
        const lowerMsg = cleanMsg.toLowerCase();

        // Handle quick ping probe
        if (lowerMsg === "ping") {
          return new Response(JSON.stringify({ reply: "Pong. Ready to breach your queries." }), {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json"
            }
          });
        }

        // 2. Parse User Query Intent: Count & Category Routing
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
  
        // 3. Get embedding for the user's query via Hugging Face BAAI/bge-small-en-v1.5
        const hfEmbedUrl = "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5";
        let embedRes;
        try {
            embedRes = await fetch(hfEmbedUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.HF_TOKEN}`,
                "Content-Type": "application/json",
                "x-use-pipeline": "feature-extraction"
              },
              body: JSON.stringify({ inputs: cleanMsg })
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: `Embedding Fetch Error: ${e.message}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        
        if (!embedRes.ok) {
            const errText = await embedRes.text();
            return new Response(JSON.stringify({ error: `HF Embedding API Error ${embedRes.status}: ${errText}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        const embedding = await embedRes.json();
  
        // 4. Query Pinecone Vector DB
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
          } catch (e) {
            // fallback
          }
        }
        if (pcHost) {
          pcHost = pcHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        }
        
        if (!pcHost || !env.PINECONE_API_KEY) {
            return new Response(JSON.stringify({ error: `Missing Pinecone host configuration. (Host: ${pcHost || 'empty'})` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        
        const pineconeTopK = Math.min(Math.max(targetCount, 5), 12);
        let pcRes;
        try {
            pcRes = await fetch(`https://${pcHost}/query`, {
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
        } catch (e) {
            return new Response(JSON.stringify({ error: `Pinecone Fetch Error: ${e.message} (Host: ${pcHost})` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        
        if (!pcRes.ok) {
            const errText = await pcRes.text();
            return new Response(JSON.stringify({ error: `Pinecone API Error ${pcRes.status} (Host: ${pcHost}): ${errText}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        const pcData = await pcRes.json();
        
        let contextArticles = [];
        if (pcData.matches && pcData.matches.length > 0) {
          for (let i = 0; i < pcData.matches.length; i++) {
            const m = pcData.matches[i];
            if (m.metadata && (m.metadata.content || m.metadata.plain_summary)) {
              const title = m.metadata.title || "Untitled Intelligence";
              let date = m.metadata.date || "Recent";
              // Convert e.g. "05 Sep 2026" or "2026-09-05" to "05 Sep 26"
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
  
        // 5. Determine Current Date in UTC & Live System Status
        const now = new Date();
        const utcFormatter = new Intl.DateTimeFormat('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC'
        });
        const utcTimeFormatter = new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'UTC'
        });
        const todayUTCStr = utcFormatter.format(now); // e.g. "10 Sep 2026"
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
          try {
            const statusFetch = await fetch("https://jeraldbenny.github.io/digifeed/digibot_status.json");
            if (statusFetch.ok) {
              const sData = await statusFetch.json();
              const syncTimestamp = sData.last_sync_utc || sData.last_sync || todayUTCStr;
              liveStatusInfo = `\n[VERIFIED LIVE SYSTEM STATUS]
- Real-Time Today Date (UTC): ${todayUTCStr}
- System Last Synchronized: ${syncTimestamp}
- Total Vectors: ${sData.total_vectors || '1,000+'}
- Active Feed Dispatches: ${sData.active_dispatches || 'Active'}
- Status: ${sData.status || 'ONLINE / SYNCED'}
- Ingestion Engine: ${sData.embedding_engine || 'FastEmbed ONNX Runtime'}
- Instruction: When responding to update date or system status queries, state this verified synchronization status in UTC and today's date (${todayUTCShort}). Do NOT cite old dispatches or random articles (e.g. Plex, Gujarat).`;
            }
          } catch (e) {
            // fallback gracefully
          }
        }

        if (isTodayNewsQuery) {
          try {
            const feedFetch = await fetch("https://jeraldbenny.github.io/digifeed/data.json");
            if (feedFetch.ok) {
              const feedData = await feedFetch.json();
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
          } catch (e) {
            // fallback gracefully
          }
        }

        const contextText = contextArticles.join("\n\n---\n\n");

        // 6. Generate Answer using Hugging Face LLM (Qwen2.5-Coder-32B-Instruct)
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
   - When asked "when were you last updated?", "what is today's date", "current date", or "system status": answer directly with the verified live status (${todayUTCShort}) in UTC and state the system is synchronized. NEVER answer with random old articles (e.g. Plex, Gujarat).
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

        const hfChatUrl = "https://router.huggingface.co/v1/chat/completions";
        let chatRes;
        try {
            chatRes = await fetch(hfChatUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.HF_TOKEN}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "Qwen/Qwen2.5-Coder-32B-Instruct",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: cleanMsg }
                ],
                max_tokens: 1500,
                temperature: 0.25
              })
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: `Chat Fetch Error: ${e.message}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        
        if (!chatRes.ok) {
            const errText = await chatRes.text();
            return new Response(JSON.stringify({ error: `HF Chat API Error ${chatRes.status}: ${errText}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        
        const chatData = await chatRes.json();
        let reply = "Error generating response.";
        if (chatData.choices && chatData.choices[0] && chatData.choices[0].message) {
           reply = chatData.choices[0].message.content.trim();
        } else if (chatData.error) {
           reply = `Model error: ${JSON.stringify(chatData.error)}`;
        }
  
        return new Response(JSON.stringify({ reply }), {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
          }
        });
  
      } catch (err) {
        return new Response(JSON.stringify({ error: `Unhandled Exception: ${err.message}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
      }
    }
};
