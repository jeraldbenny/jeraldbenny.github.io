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

        // Handle quick ping probe
        if (cleanMsg.toLowerCase() === "ping") {
          return new Response(JSON.stringify({ reply: "Pong. Ready to breach your queries." }), {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json"
            }
          });
        }
  
        // 2. Get embedding for the user's query via Hugging Face BAAI/bge-small-en-v1.5
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
  
        // 3. Query Pinecone Vector DB
        let pcHost = env.PINECONE_HOST || "";
        try {
            if (!pcHost.startsWith("http")) pcHost = "https://" + pcHost;
            const u = new URL(pcHost);
            pcHost = u.hostname;
        } catch (e) {
            // ignore
        }
        
        if (!pcHost || !env.PINECONE_API_KEY) {
            return new Response(JSON.stringify({ error: "Missing Pinecone configuration in Worker." }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        
        // Increase topK to 5 for richer semantic grounding
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
                topK: 5,
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
              const category = m.metadata.category || "General";
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
        
        const contextText = contextArticles.join("\n\n---\n\n");
  
        // 4. Generate Answer using Hugging Face LLM (Qwen2.5-Coder-32B-Instruct)
        const systemPrompt = `You are DIGIBOT, the digital forensics & cybersecurity AI assistant for DigiFeed intelligence archive.
You answer user questions strictly using the verified facts in the Context Articles below.

MANDATORY CITATION & FORMATTING RULES:
1. CITATION & HYPERLINK PATTERN:
   - For EVERY news story, vulnerability, tool release, or security alert you mention, you MUST hyperlink the headline directly to its reference URL.
   - Do NOT write a separate "(Source: ...)" or "(Reference: ...)" at the end. The link MUST be on the headline itself.
   - Date format MUST be "DD Mon YY" (e.g. "09 Aug 26", "05 Sep 26"). Do not put brackets around the date. Do not use 4-digit years.
   - Standard item pattern:
     • **DD Mon YY** — [Article Headline / Tool Name](Reference URL): Key finding or brief explanation.

2. STRUCTURE & CLEAN LINE BREAKS:
   - Always put a blank line between section titles and list items.
   - Use clean, concise hacker-terminal markdown.

3. TODAY'S NEWS & CURRENT DATE QUERIES:
   - When asked for "today's news", "top digital forensic news today", "what is the date", or "latest update", state the current date (e.g. 05 Sep 26) and list the top items using the standard item pattern above.

4. JERALD BENNY QUERIES (STRICT RULE):
   - ONLY mention Jerald Benny if the user explicitly asks about Jerald Benny, who created this, author, creator, or who made DigiBot/DigiFeed.
   - NEVER include or append a "Jerald Benny Background" section to general news, search, or technical queries.

5. GROUNDING:
   - Do not invent facts, dates, or URLs not present in the context.

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
                max_tokens: 450,
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
