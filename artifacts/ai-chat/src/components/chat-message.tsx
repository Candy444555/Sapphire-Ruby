import React from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Copy, Check, Download } from 'lucide-react';
import { Markdown } from './markdown';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@workspace/api-client-react';

interface ChatMessageProps {
  message: ChatMessageType;
  isLatest?: boolean;
}

const EXT_MAP: Record<string, string> = {
  python: 'py', py: 'py',
  javascript: 'js', js: 'js',
  typescript: 'ts', ts: 'ts',
  jsx: 'jsx', tsx: 'tsx',
  bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh',
  html: 'html', css: 'css', scss: 'scss',
  json: 'json', yaml: 'yaml', yml: 'yml',
  toml: 'toml', xml: 'xml',
  rust: 'rs', go: 'go', java: 'java',
  cpp: 'cpp', c: 'c', cs: 'cs',
  ruby: 'rb', php: 'php', swift: 'swift', kotlin: 'kt',
  sql: 'sql', r: 'r', lua: 'lua',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

async function downloadMessage(content: string) {
  // Multi-file project via // FILE: markers → zip
  if (/\/\/ FILE:/i.test(content)) {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const parts = content.split(/(?=\/\/ FILE:\s*\S)/i);
    for (const part of parts) {
      const match = part.match(/\/\/ FILE:\s*(\S+)\s*\n([\s\S]*)/i);
      if (match) zip.file(match[1].trim(), match[2].trim());
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'project.zip');
    return;
  }

  // Single code block → detect language extension
  const codeMatch = content.match(/```(\w+)?\s*\n([\s\S]*?)```/);
  if (codeMatch) {
    const lang = (codeMatch[1] ?? '').toLowerCase();
    const ext = EXT_MAP[lang] ?? 'txt';
    const code = codeMatch[2];
    downloadBlob(new Blob([code], { type: 'text/plain' }), `code.${ext}`);
    return;
  }

  // Plain text fallback
  downloadBlob(new Blob([content], { type: 'text/plain' }), 'message.txt');
}

export const ChatMessage = React.memo(({ message, isLatest }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const [downloaded, setDownloaded] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    await downloadMessage(message.content);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group flex w-full w-max-4xl mx-auto px-4 py-6 md:px-8",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn(
        "flex max-w-[85%] sm:max-w-[80%] md:max-w-[75%] gap-4 min-w-0",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        
        {/* Avatar */}
        <div className={cn(
          "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg border",
          isUser 
            ? "bg-gradient-to-br from-primary to-primary/60 border-primary/30 text-white shadow-primary/20" 
            : "bg-card border-white/5 text-primary shadow-black/20"
        )}>
          {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>

        {/* Message Bubble */}
        <div className={cn(
          "relative flex flex-col min-w-0 overflow-x-auto rounded-2xl px-5 py-4 shadow-sm",
          isUser 
            ? "bg-card border border-white/5 text-foreground rounded-tr-sm" 
            : "bg-transparent text-foreground pt-2"
        )}>
          
          {/* Action Header for Assistant */}
          {!isUser && (
            <div className="flex items-center gap-3 mb-2 text-xs font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -top-3 right-0 bg-background/80 backdrop-blur-md px-2 py-1 rounded-md border border-white/10">
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <span className="w-px h-3 bg-white/10" />
              <button 
                onClick={handleDownload}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                {downloaded ? <Check className="w-3 h-3 text-green-400" /> : <Download className="w-3 h-3" />}
                {downloaded ? "Saved" : "Download"}
              </button>
            </div>
          )}

          {/* Content */}
          {message.content ? (
            <Markdown content={message.content} />
          ) : (
            <div className="flex items-center gap-1 h-6">
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

ChatMessage.displayName = 'ChatMessage';
