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
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">
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

  return <div className="space-y-0.5 leading-6">{blocks}</div>;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`group flex w-full px-4 py-3 sm:py-4 md:px-8 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex w-full max-w-5xl gap-2 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && <DraHildaAvatar size="sm" className="mt-1 sm:[&>img]:h-12 sm:[&>img]:w-12" />}

        <div
          className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-6 transition-colors sm:max-w-[90%] sm:px-4 sm:py-3 sm:text-base md:max-w-[75%] md:px-5 md:py-4 ${
            isUser
              ? 'bg-slate-100 text-slate-900 group-hover:bg-slate-200/80'
              : 'border border-slate-200 bg-white text-slate-800 group-hover:bg-slate-50'
          }`}
        >
          {!isUser && <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 sm:mb-2">Dra. Hilda</p>}
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <FormattedMessage content={message.content} />
          )}
          {message.imageUrls?.length ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {message.imageUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200">
                  <img src={url} alt="Adjunto clínico" className="h-auto w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          <p className={`mt-2 text-[11px] ${isUser ? 'text-slate-500 text-right' : 'text-slate-400'}`}>
            {message.timestamp.toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
