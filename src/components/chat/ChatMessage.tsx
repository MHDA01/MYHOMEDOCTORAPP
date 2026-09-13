// ============================================================
// components/chat/ChatMessage.tsx — Burbuja de mensaje individual
// ============================================================
'use client';

import React from 'react';
import DraHildaAvatar from '@/components/ui/avatar';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

/* ------------------------------------------------------------------ */
/*  Render de Markdown ligero y seguro                                 */
/*  Construye nodos React (no dangerouslySetInnerHTML) — sin XSS.      */
/*  Soporta: **negrita**, *cursiva*, `código`, encabezados (#, ##),    */
/*  listas con viñetas (-, *) y numeradas (1.).                        */
/* ------------------------------------------------------------------ */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i${i}`}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {match[4]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
    i++;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function FormattedMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: { ordered: boolean; text: string }[] = [];
  let key = 0;

  const flushList = () => {
    if (!listItems.length) return;
    const ordered = listItems[0].ordered;
    const items = listItems.map((li, idx) => (
      <li key={idx}>{renderInline(li.text, `li-${key}-${idx}`)}</li>
    ));
    blocks.push(
      ordered ? (
        <ol key={`ol-${key}`} className="my-1 ml-5 list-decimal space-y-0.5">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${key}`} className="my-1 ml-5 list-disc space-y-0.5">
          {items}
        </ul>
      )
    );
    key++;
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    const heading = line.match(/^\s*(#{1,3})\s+(.*)$/);

    if (bullet) {
      listItems.push({ ordered: false, text: bullet[1] });
      continue;
    }
    if (numbered) {
      listItems.push({ ordered: true, text: numbered[1] });
      continue;
    }
    flushList();
    if (heading) {
      blocks.push(
        <p key={`h-${key++}`} className="mb-1 mt-2 font-semibold">
          {renderInline(heading[2], `h${key}`)}
        </p>
      );
      continue;
    }
    if (line.trim() === '') continue;
    blocks.push(
      <p key={`p-${key++}`} className="mb-1 last:mb-0">
        {renderInline(line, `p${key}`)}
      </p>
    );
  }
  flushList();

  return <div className="space-y-1">{blocks}</div>;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const hora = message.timestamp.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Como en el mockup: el paciente en azul profundo a la derecha, la Dra. Hilda
  // en una burbuja clara a la izquierda con su avatar. El nombre ya está en la
  // cabecera, así que no se repite dentro de cada burbuja.
  return (
    <div className={`flex w-full gap-2.5 py-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <DraHildaAvatar size="sm" className="mt-0.5 self-start" />}

      <div className={`flex min-w-0 max-w-[85%] flex-col sm:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`min-w-0 max-w-full break-words rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
            isUser
              ? 'rounded-br-lg bg-brand-900 text-white'
              : 'rounded-tl-lg bg-muted text-foreground'
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <FormattedMessage content={message.content} />
          )}
          {message.imageUrls?.length ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {message.imageUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-border/60">
                  <img src={url} alt="Adjunto clínico" className="h-auto w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <p className="mt-1 px-2 text-[11px] text-muted-foreground">{hora}</p>
      </div>
    </div>
  );
}
