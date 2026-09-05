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
          for (const m of pcData.matches) {
            if (m.metadata && m.metadata.content) {
              contextArticles.push(`[ARTICLE: ${m.metadata.title || "Untitled"}]
Date: ${m.metadata.date || "Unknown"}
Category: ${m.metadata.category || "General"}
Summary: ${m.metadata.plain_summary || ""}
Content: ${m.metadata.content}`);
            }
          }
        }
        
        const contextText = contextArticles.join("\n\n---\n\n");
  
        // 4. Generate Answer using Hugging Face LLM (Qwen2.5-Coder-32B-Instruct)
        const systemPrompt = `You are DIGIBOT, an elite digital forensics and cybersecurity AI assistant designed for Jerald Benny's DigiFeed intelligence archive.
You answer user queries strictly using the verified intelligence provided in the Context Articles below.

CRITICAL INSTRUCTIONS:
1. When the user asks for "today's news", "top digital forensic news today", "latest updates", or "current date", prioritize any Daily Intelligence Briefing or System Status records in the context. Clearly cite the current date and summarize the top headlines, CVEs, and threats accurately.
2. If asked about Jerald Benny, highlight his expertise in digital forensics, incident response, memory analysis, and cyber threat intelligence.
3. Keep responses direct, well-structured with bullet points and bold headers, hacker-themed, and technically precise. Do not hallucinate outside the provided context.

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
