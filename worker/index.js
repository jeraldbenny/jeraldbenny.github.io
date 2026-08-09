/**
 * JB:INTEL-BOT Secure API Bridge (Cloudflare Worker)
 * 
 * This worker securely proxies requests from the frontend widget to:
 * 1. Hugging Face Inference API (for embeddings and chat generation)
 * 2. Pinecone Vector DB (for retrieving relevant articles)
 * 
 * Environment Variables Required (Add via Cloudflare Dashboard or wrangler.toml):
 * - HF_TOKEN
 * - PINECONE_API_KEY
 */

export default {
    async fetch(request, env, ctx) {
      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
  
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
  
      try {
        const { message, history } = await request.json();
        if (!message) {
          return new Response("Missing message", { status: 400 });
        }
  
        // 1. Get embedding for the user's query
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
              body: JSON.stringify({ inputs: message })
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: `Embedding Fetch Error: ${e.message}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        
        if (!embedRes.ok) {
            const errText = await embedRes.text();
            return new Response(JSON.stringify({ error: `HF Embedding API Error ${embedRes.status}: ${errText}` }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        const embedding = await embedRes.json();
  
        // 2. Query Pinecone
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
                topK: 3,
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
        
        let contextText = "";
        if (pcData.matches && pcData.matches.length > 0) {
          contextText = pcData.matches.map(m => `Title: ${m.metadata.title}\nContent: ${m.metadata.content}`).join("\n\n");
        }
  
        // 3. Generate Answer using Hugging Face (Qwen2.5-Coder-32B-Instruct)
        const systemPrompt = `You are JB:INTEL-BOT, a digital forensics and cybersecurity AI assistant for Jerald Benny's DigiFeed archive. You answer questions based on the provided context articles. If the user asks for "today's news", "latest news", or "recent updates", summarize the provided context articles as the latest intelligence available in the DigiFeed archive. Keep answers concise, hacker-themed, and professional.\n\nContext Articles:\n${contextText}`;

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
                  { role: "user", content: message }
                ],
                max_tokens: 300,
                temperature: 0.3
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
