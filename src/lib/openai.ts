import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  // Intentionally not throwing to avoid build-time failure;
  // API route will handle missing key gracefully.
  console.warn("OPENAI_API_KEY is not set.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

