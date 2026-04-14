import React from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Copy, Check } from 'lucide-react';
import { Markdown } from './markdown';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@workspace/api-client-react';

interface ChatMessageProps {
  message: ChatMessageType;
  isLatest?: boolean;
}

export const ChatMessage = React.memo(({ message, isLatest }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            <div className="flex items-center gap-2 mb-2 text-xs font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -top-3 right-0 bg-background/80 backdrop-blur-md px-2 py-1 rounded-md border border-white/10">
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
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
