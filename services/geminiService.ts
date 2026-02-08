
import { GoogleGenAI, Type } from "@google/genai";
import { ProductivityTip } from "../types";

export const getWorkdayTip = async (remainingHours: number): Promise<ProductivityTip> => {
  const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY || "");
  
  if (!apiKey) {
    return {
      title: "Ready to Work?",
      advice: "Start your timer and stay focused on your goals today."
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `The current user has ${remainingHours.toFixed(1)} hours left in their workday. Provide a brief, inspiring productivity tip or focus strategy for this specific stage of the day. Keep it under 100 characters for the title and 200 for the advice. Return strictly JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            advice: { type: Type.STRING }
          },
          required: ["title", "advice"]
        }
      }
    });

    const json = JSON.parse(response.text);
    return json as ProductivityTip;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      title: "Stay Focused",
      advice: "Remember to take short breaks and stay hydrated throughout your journey."
    };
  }
};
