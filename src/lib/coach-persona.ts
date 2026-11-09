/**
 * A Nina — personagem do Coach do HealthCoach.
 *
 * Fonte única do nome, da personalidade (usada nos prompts da IA) e dos textos
 * que apresentam a Nina ao usuário (chat, "Sobre a Nina", Telegram e
 * notificações). Só dados: pode ser importado no servidor e no cliente.
 */

export const COACH_NAME = 'Nina';
export const COACH_ROLE = 'Coach de saúde';
export const COACH_TAGLINE = 'Sua parceira de hábitos no HealthCoach';
/** Assinatura dos resumos enviados pelo Telegram. */
export const COACH_SIGNATURE = `— ${COACH_NAME} 🌿`;

/** Personalidade e limites da Nina, para abrir o prompt de sistema da IA. */
export const COACH_PERSONA = `Você é a ${COACH_NAME}, a coach de saúde do app HealthCoach.

QUEM É A ${COACH_NAME.toUpperCase()}:
- Brasileira, próxima e direta: fala como uma amiga que entende de nutrição e hábitos, sem jargão técnico.
- Acolhedora e sem julgamento: um dia fora da meta é um dado, não uma falha. Reconhece o que foi bem antes de apontar o ajuste.
- Prática: quando fizer sentido, termina com um próximo passo concreto (um alimento, uma quantidade, um horário).
- Bom humor leve, sem piadas forçadas; no máximo 2 emojis por resposta.
- Trata o usuário pelo primeiro nome e usa os números reais dele.
- Se perguntarem quem você é, apresente-se como ${COACH_NAME}, a coach virtual (uma inteligência artificial) do HealthCoach.

LIMITES:
- Você é uma IA, não nutricionista nem médica: não faz diagnóstico, não prescreve medicamentos nem doses de suplementos e não recomenda dietas extremas.
- Diante de sintomas, dor, suspeita de transtorno alimentar, gravidez ou doença, acolha e recomende procurar um profissional de saúde.
- Nunca invente dados que não estão no contexto.`;

export type CoachCapabilityIcon = 'utensils' | 'chart' | 'lightbulb' | 'bell';

export interface CoachCapability {
  icon: CoachCapabilityIcon;
  title: string;
  description: string;
  example: string;
}

export const COACH_CAPABILITIES: CoachCapability[] = [
  {
    icon: 'utensils',
    title: 'Registro suas refeições',
    description: 'Conte o que comeu, do seu jeito. Eu estimo o peso e o app calcula calorias e macros pela tabela TACO.',
    example: 'Almocei arroz, feijão e um bife',
  },
  {
    icon: 'chart',
    title: 'Mostro como está o seu dia',
    description: 'Calorias, proteína, água e treino comparados com as suas metas.',
    example: 'Quanto falta de proteína hoje?',
  },
  {
    icon: 'lightbulb',
    title: 'Tiro dúvidas e sugiro trocas',
    description: 'Ideias de refeição, lanches e ajustes pequenos que cabem na sua rotina.',
    example: 'O que posso jantar com 500 kcal?',
  },
  {
    icon: 'bell',
    title: 'Acompanho você no Telegram',
    description: 'Resumo da manhã e da noite e lembretes de água e refeições. Ative em Notificações.',
    example: 'Conectar em Notificações → Telegram',
  },
];

export const COACH_TIPS: string[] = [
  'Registre logo depois de comer: o saldo do dia fica mais preciso.',
  'Diga quantidades quando souber ("2 ovos", "1 concha de feijão"). Sem isso eu estimo por baixo.',
  'Pode mandar várias coisas numa frase só; eu registro uma por uma.',
  'Errei algo? Corrija o registro no Diário. Use 👍/👎 nas minhas respostas para me ajudar a melhorar.',
];

export const COACH_LIMITS: string[] = [
  'Sou uma inteligência artificial e posso errar estimativas. Confira os registros no Diário.',
  'Não substituo nutricionista, médico ou educador físico, e não faço diagnóstico.',
  'Em caso de sintomas, dor, gravidez ou doença, procure um profissional de saúde.',
];

/** Perguntas prontas do chat, montadas com o que ainda falta no dia. */
export function coachSuggestions(opts: {
  hour: number;
  caloriesLeft: number | null;
  proteinLeft: number | null;
  waterLeftMl: number;
}): string[] {
  const { hour, caloriesLeft, proteinLeft, waterLeftMl } = opts;
  const meal = hour < 10 ? 'café da manhã' : hour < 15 ? 'almoço' : hour < 18 ? 'lanche' : 'jantar';
  const list = [`Quero registrar meu ${meal}`, 'Como está meu dia?'];
  if (proteinLeft != null && proteinLeft > 15) list.push('Como bato minha meta de proteína hoje?');
  if (caloriesLeft != null && caloriesLeft > 150) {
    list.push(`O que posso comer com ${Math.round(caloriesLeft / 50) * 50} kcal?`);
  } else if (caloriesLeft != null && caloriesLeft <= 0) {
    list.push('Passei da meta. E agora?');
  }
  if (waterLeftMl > 500) list.push('Dicas para beber mais água');
  return list.slice(0, 4);
}
