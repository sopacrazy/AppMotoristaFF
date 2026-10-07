import { GoogleGenAI } from "@google/genai";
import { Delivery } from "../types";

// NOTE: In a real production app, this key should be proxy-served or strictly env variable.
// Since this is a client-side demo generator, we assume process.env.API_KEY is available.
const API_KEY = process.env.API_KEY || ''; 

// We handle the case where the key might be missing gracefully in the UI
const genAI = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

export const getDeliveryAssistantTip = async (delivery: Delivery): Promise<string> => {
  if (!genAI) {
    return "Dica IA: Verifique o trânsito antes de sair. (Configure a API Key para dicas reais)";
  }

  try {
    const prompt = `
      Eu sou um motorista de entrega. Estou indo entregar para:
      Cliente: ${delivery.customerName}
      Endereço: ${delivery.address}, ${delivery.district}
      Nota: ${delivery.note}

      Me dê uma dica muito curta (máximo 1 frase) sobre segurança ou eficiência para essa entrega específica.
      Responda em Português do Brasil.
    `;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Dirija com cuidado.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Não foi possível carregar a dica no momento.";
  }
};