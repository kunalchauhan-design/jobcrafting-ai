import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const getAi = () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Please set GEMINI_API_KEY or VITE_GEMINI_API_KEY.");
  }
  return new GoogleGenAI({ apiKey });
};

const FLASH_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
];

function isRetryableError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.code;
  // Only retry on transient quota or service availability issues (429 / 503 / temporary demand spikes)
  return (
    status === 429 ||
    status === 503 ||
    status === 502 ||
    status === 504 ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded")
  );
}

async function generateWithFallback(contents: any, config?: any) {
  let lastError: any = null;
  for (const model of FLASH_MODELS) {
    try {
      return await getAi().models.generateContent({
        model,
        contents,
        config,
      });
    } catch (err: any) {
      lastError = err;
      if (isRetryableError(err)) {
        console.warn(`Model ${model} temporarily unavailable, trying next model in fallback chain...`);
        continue;
      }
      // Non-retryable errors (e.g. 400 Bad Request, 401 Unauthorized) fail fast without trying other models
      throw err;
    }
  }
  throw lastError;
}

async function createChatWithFallback(params: any) {
  let lastError: any = null;
  for (const model of FLASH_MODELS) {
    try {
      const chat = getAi().chats.create({
        model,
        history: params.history || [],
        config: { systemInstruction: params.systemInstruction },
      });
      return await chat.sendMessage({ message: params.message });
    } catch (err: any) {
      lastError = err;
      if (isRetryableError(err)) {
        console.warn(`Model ${model} temporarily unavailable for chat, trying next model in fallback chain...`);
        continue;
      }
      // Non-retryable errors fail fast without trying other models
      throw err;
    }
  }
  throw lastError;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { action, params } = req.body;

  try {
    switch (action) {
      case "chatMessage": {
        // params: { history: [{role, parts}], message: string, systemInstruction: string }
        const response = await createChatWithFallback(params);
        return res.status(200).json({ text: response.text });
      }

      case "enhanceCV": {
        const response = await generateWithFallback(
          `Optimize this CV for a ${params.targetJob} role. Highlight transferable skills using strong action verbs. Return clear Markdown:\n"${params.currentCV}"`
        );
        return res.status(200).json({ text: response.text });
      }

      case "enhanceCVFromImage": {
        const response = await generateWithFallback([
          { inlineData: { mimeType: params.mimeType, data: params.base64Image } },
          { text: `Extract, rewrite, and optimize this CV image for a ${params.targetJob} role. Deliver clean Markdown.` },
        ]);
        return res.status(200).json({ text: response.text });
      }

      case "generateImageCV": {
        const response = await generateWithFallback(
          `You are an elite graphic designer and resume typographer.
Create a complete, beautifully designed, professional visual CV in SVG format (width="800" height="1130" viewBox="0 0 800 1130").

STYLE SPECIFICATION:
- Chosen Style: "${params.style || "Modern Minimalist"}".
- Target Job Role: "${params.targetJob}".
- Reflect the visual aesthetic of ${params.style || "Modern Minimalist"}:
  * If "Modern Minimalist": Ultra-clean lines, spacious margins, subtle dividers, monochrome/slate palette, crisp typographic hierarchy.
  * If "Creative Tech": High-contrast design, modern tech accents (blues/indigos), sleek badge elements for skills, modern timeline markers.
  * If "Executive Classic": Sophisticated dark navy / charcoal palette, authoritative header, formal section rules, dual-column structure.
  * If "Visual Infographic": Visual data badges, color-coded section banners, timeline graphics, highlighted key metrics.

STRICT CONTENT & DESIGN RULES:
1. Return ONLY the raw SVG code. Do NOT wrap in markdown fences (\`\`\`xml or \`\`\`), and do NOT include any commentary.
2. The output MUST start with <svg and end with </svg>.
3. Include xmlns="http://www.w3.org/2000/svg".
4. Include an embedded <style> with crisp modern fonts (font-family: system-ui, -apple-system, sans-serif).
5. Preserve ALL content, dates, bullet points, skills, contact info, and job titles from the CV accurately without fabricating or removing information.
6. Ensure legible text sizes, proper line height, and non-overlapping coordinates for all elements.
7. Wrap or split long lines across multiple <text> or <tspan> elements so no text is clipped or overflows.

CV CONTENT:
${params.content}`
        );

        let rawSvg = response.text?.trim() || "";
        // Clean any code fences if present
        if (rawSvg.startsWith("```xml")) rawSvg = rawSvg.slice(6);
        else if (rawSvg.startsWith("```svg")) rawSvg = rawSvg.slice(6);
        else if (rawSvg.startsWith("```")) rawSvg = rawSvg.slice(3);
        if (rawSvg.endsWith("```")) rawSvg = rawSvg.slice(0, -3);
        rawSvg = rawSvg.trim();

        const startIdx = rawSvg.indexOf("<svg");
        const endIdx = rawSvg.lastIndexOf("</svg>");
        if (startIdx !== -1 && endIdx !== -1) {
          rawSvg = rawSvg.slice(startIdx, endIdx + 6);
        } else {
          throw new Error("Failed to generate a valid SVG visual CV. Please try again.");
        }

        const dataUrl = `data:image/svg+xml;base64,${Buffer.from(rawSvg).toString("base64")}`;
        return res.status(200).json({ image: dataUrl });
      }

      case "suggestJobs": {
        const response = await generateWithFallback(
          `Generate exactly 8 realistic mock job listings specifically matching the target job role: "${params.query}".

IMPORTANT:
- Every job MUST be directly relevant to the target job role provided above.
- Job titles should be specific variations, experience levels, or specializations of the target role.
- DO NOT generate unrelated job roles just because they belong to the same broad industry or technology category.
- For example, if the target role is "Data Analyst", generate Data Analyst-related positions, not Software Engineer, Product Manager, DevOps Engineer, or UX Designer positions.
- If the target role is "Java Developer", generate Java Developer-related positions, not Python Developer, Data Analyst, Product Manager, or UX Designer positions.
- The description, requirements, skills, and tags must all be relevant to the target job role.
- Include a realistic mix of experience levels where appropriate, such as Junior, Mid-Level, Senior, Lead, or specialized variations.
- Location: "${params.location || "Any"}".
- Freelance: ${!!params.isFreelance}.
- Remote Only: ${!!params.remoteOnly}.
- If Remote Only is true, every job MUST be remote.
- If Freelance is true, prioritize Freelance or Contract opportunities.
- Keep company names, salaries, descriptions, requirements, and dates realistic and internally consistent.
- These are mock/demo job listings, not real job postings.

Return only the requested JSON array.`,
          {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  company: { type: Type.STRING },
                  location: { type: Type.STRING },
                  salary: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING },
                  requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  postedDate: { type: Type.STRING },
                  companyRating: { type: Type.NUMBER },
                  companyReviewsCount: { type: Type.INTEGER },
                  isRemote: { type: Type.BOOLEAN },
                },
                required: ["id", "title", "company", "location", "salary", "type", "description", "requirements", "tags", "postedDate", "isRemote"],
              },
            },
          }
        );
        return res.status(200).json(JSON.parse(response.text || "[]"));
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  }  catch (e: any) {
    console.error("Gemini proxy error", e);
    return res.status(500).json({
      error: "Gemini request failed",
      details: e?.message || String(e),
    });
  }
}