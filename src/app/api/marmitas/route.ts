import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { targetCalories, proteinGoal, carbsGoal, fatGoal, preferences } = await req.json();

  const macroHint = [
    proteinGoal ? `proteína: ${proteinGoal}g` : null,
    carbsGoal ? `carboidratos: ${carbsGoal}g` : null,
    fatGoal ? `gordura: ${fatGoal}g` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = `Você é um nutricionista especialista em meal prep. Gere exatamente 3 sugestões de marmitas saudáveis e saborosas para uma pessoa com as seguintes metas nutricionais diárias:
- Calorias: ${targetCalories} kcal/dia${macroHint ? `\n- Macros: ${macroHint}` : ''}${preferences ? `\n- Preferências: ${preferences}` : ''}

Cada marmita deve ser uma refeição completa (almoço ou jantar) com aproximadamente 1/3 das calorias diárias.

Responda SOMENTE com um JSON válido no seguinte formato (sem markdown, sem código):
{
  "marmitas": [
    {
      "nome": "Nome da marmita",
      "descricao": "Breve descrição apetitosa",
      "calorias": 650,
      "proteina": 45,
      "carboidratos": 60,
      "gordura": 15,
      "ingredientes": ["100g frango grelhado", "150g arroz integral", "..."],
      "preparo": "Instruções simples de preparo em 2-4 frases."
    }
  ]
}`;

  try {
    const ai = getGemini();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Failed to generate marmitas' }, { status: 500 });
  }
}
