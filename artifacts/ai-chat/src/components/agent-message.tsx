import React, { useState } from 'react';
import { Terminal, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentMessage as AgentMsg, AgentEvent } from '@/hooks/use-agent-chat';
import { Markdown } from './markdown';

interface AgentMessageViewProps {
  message: AgentMsg;
  isLatest?: boolean;
  isThinking?: boolean;
}

function CommandBlock({ event, result }: {
  event: Extract<AgentEvent, { type: 'cmd_start' }>;
  result?: Extract<AgentEvent, { type: 'cmd_result' }>;
}) {
  const [expanded, setExpanded] = useState(true);
  const pending = !result;
  const success = result && result.exitCode === 0;

  return (
    <div className="my-2 rounded-xl border border-border overflow-hidden font-mono text-xs">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900/80 text-left hover:bg-zinc-800/80 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-primary/90 flex-1 truncate">$ {event.command}</span>
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
        ) : success ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-destructive" />
        )}
        {!pending && (expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        ))}
      </button>
      {expanded && result && (
        <div className={cn(
          "px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-64 overflow-y-auto",
          success ? "bg-zinc-950/60 text-zinc-300" : "bg-destructive/5 text-red-300"
        )}>
          {result.output || <span className="text-muted-foreground italic">(no output)</span>}
          {result.cwd && (
            <div className="mt-1.5 pt-1.5 border-t border-border/40 text-muted-foreground text-[10px]">
              cwd: {result.cwd}  exit: {result.exitCode}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentMessageView({ message, isLatest, isThinking }: AgentMessageViewProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-sm bg-primary text-primary-foreground text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  const events = message.events ?? [];
  const pendingCmds = new Map<string, Extract<AgentEvent, { type: 'cmd_start' }>>();
  const resultsByCmd = new Map<string, Extract<AgentEvent, { type: 'cmd_result' }>>();

  const seenCmds: string[] = [];
  for (const ev of events) {
    if (ev.type === 'cmd_start') {
      const key = `${ev.command}-${seenCmds.filter(c => c === ev.command).length}`;
      pendingCmds.set(key, ev);
      seenCmds.push(ev.command);
    } else if (ev.type === 'cmd_result') {
      const idx = seenCmds.filter(c => c === ev.command).length - 1;
      const key = `${ev.command}-${idx}`;
      resultsByCmd.set(key, ev);
    }
  }

  const cmdStartEvents: Array<{ key: string; event: Extract<AgentEvent, { type: 'cmd_start' }> }> = [];
  const seenCount = new Map<string, number>();
  for (const ev of events) {
    if (ev.type === 'cmd_start') {
      const count = seenCount.get(ev.command) ?? 0;
      cmdStartEvents.push({ key: `${ev.command}-${count}`, event: ev });
      seenCount.set(ev.command, count + 1);
    }
  }

  const isEmpty = !message.content && cmdStartEvents.length === 0 && !message.needsInput;

  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
        <Terminal className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {isEmpty && isLatest && isThinking && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Dolphin is thinking…</span>
          </div>
        )}

        {cmdStartEvents.map(({ key, event }) => (
          <CommandBlock key={key} event={event} result={resultsByCmd.get(key)} />
        ))}

        {message.content && (
          <div className="mt-2 text-sm leading-relaxed text-foreground">
            <Markdown content={message.content} />
          </div>
        )}

        {message.needsInput && (
          <div className="mt-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            <span className="font-semibold">Dolphin needs your input: </span>
            {message.needsInput}
          </div>
        )}
      </div>
    </div>
  );
}
