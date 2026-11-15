/**
 * Formatação das respostas da Nina no chat: a IA escreve em Markdown simples
 * e o app mostra parágrafos, títulos curtos e listas — sem nunca virar HTML.
 */

export type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: { n: number; text: string }[] };

const UL_RE = /^\s*[-•*–]\s+/;
const OL_RE = /^\s*(\d+)[.)]\s+/;
const HEADING_RE = /^\s*#{1,6}\s+/;
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
// Linha inteira em negrito ("**Opções para o jantar:**") funciona como título.
const BOLD_LINE_RE = /^\s*\*\*([^*]+)\*\*\s*:?\s*$/;

/** Quebra a resposta da Nina em parágrafos, títulos e listas. */
export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraphOpen = false;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim() || RULE_RE.test(line)) { paragraphOpen = false; continue; }

    const ol = line.match(OL_RE);
    if (HEADING_RE.test(line)) {
      blocks.push({ type: 'h', text: line.replace(HEADING_RE, '').replace(/\*\*/g, '') });
      paragraphOpen = false;
    } else if (BOLD_LINE_RE.test(line)) {
      blocks.push({ type: 'h', text: line.match(BOLD_LINE_RE)![1].replace(/:$/, '') });
      paragraphOpen = false;
    } else if (ol) {
      const item = { n: Number(ol[1]), text: line.replace(OL_RE, '') };
      if (last?.type === 'ol') last.items.push(item);
      else blocks.push({ type: 'ol', items: [item] });
      paragraphOpen = false;
    } else if (UL_RE.test(line)) {
      if (last?.type === 'ul') last.items.push(line.replace(UL_RE, ''));
      else blocks.push({ type: 'ul', items: [line.replace(UL_RE, '')] });
      paragraphOpen = false;
    } else if (paragraphOpen && last?.type === 'p') {
      last.lines.push(line.trim());
    } else {
      blocks.push({ type: 'p', lines: [line.trim()] });
      paragraphOpen = true;
    }
  }
  return blocks;
}
