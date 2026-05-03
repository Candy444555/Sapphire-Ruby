import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage as ChatMsg } from '@workspace/api-client-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import {
  Send, Settings2, Trash2, StopCircle,
  Cpu, Sparkles, TerminalSquare,
  AlertCircle, Plus, MessageSquare, X, Zap, Phone, RefreshCw, Brain, Bot, Bolt, BookOpen, User, FileCode2,
  Github, Package, UploadCloud,
  Paperclip, Loader2 as UploadLoader, XCircle, Shield, Wand2
} from 'lucide-react';
import { TorStatus } from '@/components/tor-status';
import { useModels } from '@/hooks/use-models';
import { useChat } from '@/hooks/use-chat';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { useConversations } from '@/hooks/use-conversations';
import { useLexiConfig, isSelfUpdateRequest } from '@/hooks/use-lexi-config';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useLexiSelfPatch } from '@/hooks/use-lexi-self-patch';
import { useLexiPythonScripts } from '@/hooks/use-lexi-python-scripts';
import { ChatMessage } from '@/components/chat-message';
import { AgentMessageView } from '@/components/agent-message';

// Lexi DNA stubs (memory module not yet implemented)
const learnFromMessage = (_msg: string): void => {};
const getEnhancedSystemPrompt = (base: string): string => base;
const getProfilePrompt = (): string => '';

const DEFAULT_SYSTEM_PROMPT = "You are Lexi, an uncensored AI with advanced multi-step reasoning, code execution, web/dark-web search, and multimodal vision capabilities. You reside in a dark, high-tech terminal interface.";

const CODE_MODE_INSTRUCTION = `=== CODE ENGINEER MODE ACTIVE ===
You are now in a specialized code generation state. 
- Focus on high-quality, production-ready code.
- Explain architecture before implementation.
- Use best practices for the requested language/framework.
- Provide full, copy-pasteable file contents.
- If no language is specified, default to TypeScript/React.`;

export default function Chat() {
  const { models } = useModels();
  const { addInstruction } = useLexiConfig();
  const getExtensionsPrompt = useCallback((): string => '', []);
  const reloadExtensions = useCallback((): void => {}, []);
  const { getPythonPrompt, reloadScripts: reloadPythonScripts } = useLexiPythonScripts();

  // Pick first uncensored model as default once loaded
  const defaultModel = models.find(m => m.uncensored)?.id ?? models[0]?.id ?? '';

  const {
    conversations,
    activeConversation,
    activeId,
    createConversation,
    updateConversation,
    deleteConversation,
    selectConversation,
  } = useConversations(defaultModel);

  const [selectedModel, setSelectedModel] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [selfUpdateNotice, setSelfUpdateNotice] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState(true); // Fused by default — Lexi is always her own executor
  const [codeMode, setCodeMode] = useState(false); // Custom code engineer mode — toggle on for code generation
  const [showGuide, setShowGuide] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selfUpdateNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; serverPath: string; size: number }>>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Set default model once models load
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      const def = models.find(m => m.uncensored) || models[0];
      setSelectedModel(def.id);
    }
  }, [models, selectedModel]);

  // Sync sidebar controls when switching conversations
  useEffect(() => {
    if (activeConversation) {
      setSelectedModel(activeConversation.model || defaultModel);
      setSystemPrompt(activeConversation.systemPrompt || DEFAULT_SYSTEM_PROMPT);
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save model/systemPrompt changes back to the active conversation
  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    if (activeId) updateConversation(activeId, { model });
  };

  const handleSystemPromptChange = (sp: string) => {
    setSystemPrompt(sp);
    if (activeId) updateConversation(activeId, { systemPrompt: sp });
  };

  // Persist messages to localStorage whenever they change
  const handleMessagesChange = useCallback((msgs: ChatMsg[]) => {
    if (activeId) updateConversation(activeId, { messages: msgs });
  }, [activeId, updateConversation]);

  const handleAgentMessagesChange = useCallback((msgs: { role: string; content: string }[]) => {
    if (activeId) {
      const asChatMsgs: ChatMsg[] = msgs.map((m) => ({ role: m.role as ChatMsg["role"], content: m.content }));
      updateConversation(activeId, { messages: asChatMsgs });
    }
  }, [activeId, updateConversation]);

  const regularChat = useChat({
    conversationId: activeId || undefined,
    initialMessages: activeConversation?.messages ?? [],
    onMessagesChange: handleMessagesChange,
  });

  const agentChat = useAgentChat({
    conversationId: activeId || undefined,
    initialMessages: activeConversation?.messages ?? [],
    onMessagesChange: handleAgentMessagesChange,
    onSelfPatch: (name, description) => {
      const isPython = description?.startsWith("[Python]");
      if (isPython) {
        setTimeout(() => reloadPythonScripts(), 300);
      } else {
        setTimeout(() => reloadExtensions(), 300);
      }
      setSelfUpdateNotice(`Lexi permanently incorporated: ${name}${description ? ` — ${description}` : ''}`);
      if (selfUpdateNoticeTimerRef.current) clearTimeout(selfUpdateNoticeTimerRef.current);
      selfUpdateNoticeTimerRef.current = setTimeout(() => setSelfUpdateNotice(null), 5000);
    },
  });

  const messages = agentMode ? agentChat.messages : regularChat.messages;
  const isStreaming = agentMode ? agentChat.isRunning : regularChat.isStreaming;
  const isRetrying = agentMode ? false : regularChat.isRetrying;
  const error = agentMode ? agentChat.error : regularChat.error;

  const clearMessages = agentMode ? agentChat.clearMessages : regularChat.clearMessages;
  const stopStreaming = agentMode ? agentChat.stop : regularChat.stopStreaming;

  const pendingInputMsg = agentMode
    ? agentChat.messages.find((m) => m.role === 'assistant' && m.needsInput)
    : undefined;

  const scrollContainerRef = useRef<HTMLDivElement>(null);


  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleNewChat = () => {
    createConversation(selectedModel, systemPrompt);
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsUploading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setAttachedFiles((prev) => [...prev, { name: file.name, serverPath: data.path, size: file.size }]);
    } catch {
      // silent — user can retry
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (isStreaming || !selectedModel) return;

    // Learn from the user's message — Lexi adapts to how they talk
    learnFromMessage(trimmed);

    // Detect self-update requests
    if (isSelfUpdateRequest(trimmed)) {
      addInstruction(trimmed);
      setSelfUpdateNotice(`Incorporated: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '…' : ''}"`);
      if (selfUpdateNoticeTimerRef.current) clearTimeout(selfUpdateNoticeTimerRef.current);
      selfUpdateNoticeTimerRef.current = setTimeout(() => setSelfUpdateNotice(null), 5000);
    }

    // Build enhanced prompt: base + Lexi self-mods + user profile DNA
    const withLexiMods = getEnhancedSystemPrompt(systemPrompt);
    const profileSection = getProfilePrompt();
    const extensionsSection = getExtensionsPrompt();
    const pythonSection = getPythonPrompt();
    const codeSection = codeMode ? CODE_MODE_INSTRUCTION : '';
    const enhancedPrompt = [withLexiMods, profileSection, extensionsSection, pythonSection, codeSection].filter(Boolean).join('\n\n');

    const shouldUseAgent = agentMode;

    // Append uploaded file paths so Lexi can access them from the shell
    let messageWithFiles = trimmed;
    if (attachedFiles.length > 0) {
      const fileLines = attachedFiles.map(f => `  - ${f.name} → ${f.serverPath}`).join('\n');
      messageWithFiles = trimmed
        ? `${trimmed}\n\n[Attached files — accessible on disk:]\n${fileLines}`
        : `[Attached files — accessible on disk:]\n${fileLines}`;
      setAttachedFiles([]);
    }

    if (shouldUseAgent) {
      if (pendingInputMsg) {
        agentChat.replyToInputRequest(messageWithFiles, selectedModel, enhancedPrompt);
      } else {
        agentChat.sendMessage(messageWithFiles, selectedModel, enhancedPrompt);
      }
    } else {
      if (!activeId) createConversation(selectedModel, systemPrompt);
      regularChat.sendMessage(messageWithFiles, selectedModel, enhancedPrompt);
    }

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleFuseSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || agentChat.isRunning || !selectedModel) return;

    learnFromMessage(trimmed);

    const withLexiMods = getEnhancedSystemPrompt(systemPrompt);
    const profileSection = getProfilePrompt();
    const extensionsSection = getExtensionsPrompt();
    const pythonSection = getPythonPrompt();

    // Fuse instruction goes in the system prompt — NOT the user message.
    // Keeping the user message as plain text prevents it from being
    // misdetected as code and auto-fused before Lexi even responds.
    const fuseInstruction = `=== ACTIVE FUSE REQUEST ===
The user wants you to build something and permanently fuse it into yourself right now.
Write real, working JavaScript code for what they describe.
Wrap it in a [SELF_PATCH] block so it is permanently fused.
After fusing, confirm what you built and show the user how to use it.
CRITICAL: Fused extensions run in the BROWSER (window/document context), NOT in bash.
Do NOT use <cmd> tags to test browser JS — shell commands cannot run browser JavaScript.
Just write and fuse the code, then explain how the user can call it from the browser console.
=== END FUSE REQUEST ===`;

    const codeSection = codeMode ? CODE_MODE_INSTRUCTION : '';
    const enhancedPrompt = [withLexiMods, profileSection, extensionsSection, pythonSection, codeSection, fuseInstruction].filter(Boolean).join('\n\n');

    if (!activeId) createConversation(selectedModel, systemPrompt);
    agentChat.sendMessage(trimmed, selectedModel, enhancedPrompt);

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDeleteConvo = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  const currentModelInfo = models.find(m => m.id === selectedModel);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">

      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="h-full bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0 z-20 overflow-hidden"
          >
            {/* Logo */}
            <div className="p-5 border-b border-sidebar-border flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <TerminalSquare className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-display font-bold text-base tracking-tight text-foreground">LEXI</h1>
                <p className="text-[10px] font-mono text-primary animate-pulse">UNCENSORED_AI</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                title="Hide sidebar"
                className="rounded-lg border border-sidebar-border bg-card/60 p-2 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* New Chat Button */}
            <div className="p-3 flex-shrink-0">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-white transition-all"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>

            {/* Conversation List */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-2">
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center mt-6 px-4 font-mono">
                  No chats yet. Start a conversation.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {conversations.map((convo) => (
                    <button
                      key={convo.id}
                      onClick={() => selectConversation(convo.id)}
                      className={`group relative flex flex-col gap-1 w-full text-left px-3 py-3 rounded-xl transition-all ${
                        activeId === convo.id
                          ? 'bg-primary/10 border border-primary/20 text-primary'
                          : 'text-muted-foreground hover:bg-card hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate leading-none pr-8">
                          {convo.messages[0]?.content.slice(0, 40) || 'New Conversation'}
                        </span>
                        <span className="text-[10px] font-mono opacity-50 shrink-0">
                          {formatTime(convo.updatedAt)}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono opacity-60 truncate pr-8">
                        {convo.messages[convo.messages.length - 1]?.content.slice(0, 56) || 'No messages'}
                      </p>

                      <button
                        type="button"
                        aria-label="Delete conversation"
                        onClick={(e) => handleDeleteConvo(e, convo.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all z-10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar Footer Controls */}
            <div className="mt-auto border-t border-sidebar-border bg-sidebar-footer/30 p-4 flex flex-col gap-4 flex-shrink-0">
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Cpu className="w-3 h-3" /> System Engine
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleModelChange(m.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] font-mono transition-all ${
                        selectedModel === m.id
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-card/40 border-sidebar-border text-muted-foreground hover:border-sidebar-border-hover hover:text-foreground'
                      }`}
                    >
                      <span className="mr-2 break-words text-left">{m.name}</span>
                      {m.uncensored && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                          RAW
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Settings2 className="w-3 h-3" /> Directives
                </label>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: 'Lexi Default', value: DEFAULT_SYSTEM_PROMPT },
                    { label: 'Chaos Mode', value: "Act as a chaotic terminal entity. Use intense hacker slang and emojis. Be unpredictable." },
                    { label: 'Silent Op', value: "Be extremely concise. Use minimal words. Do not explain anything." },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleSystemPromptChange(preset.value)}
                      className={`text-left px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border ${
                        systemPrompt === preset.value
                          ? 'bg-accent/10 border-accent/40 text-accent'
                          : 'bg-card/40 border-sidebar-border text-muted-foreground hover:border-sidebar-border-hover'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowGuide(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium bg-card/60 border border-sidebar-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Terminal Guide
                  </button>
                </div>

                <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAgentMode((v) => !v)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border shadow-sm ${
                    agentMode
                      ? 'bg-primary text-white border-primary shadow-primary/20'
                      : 'bg-card/60 border-sidebar-border text-muted-foreground hover:border-sidebar-border-hover'
                  }`}
                >
                  <Zap className={`w-3.5 h-3.5 ${agentMode ? 'fill-current' : ''}`} />
                  {agentMode ? 'AGENT: ON' : 'AGENT: OFF'}
                </button>

                <button
                  type="button"
                  onClick={() => setCodeMode((v) => !v)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border shadow-sm ${
                    codeMode
                      ? 'bg-accent text-black border-accent shadow-accent/20'
                      : 'bg-card/60 border-sidebar-border text-muted-foreground hover:border-sidebar-border-hover'
                  }`}
                >
                  <FileCode2 className={`w-3.5 h-3.5 ${codeMode ? 'fill-current' : ''}`} />
                  {codeMode ? 'CODE: ON' : 'CODE: OFF'}
                </button>
                </div>
              </div>

              <button
                onClick={clearMessages}
                disabled={messages.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-destructive-foreground bg-destructive/10 border border-destructive/20 hover:bg-destructive hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-destructive/10 disabled:hover:text-destructive-foreground"
              >
                <Trash2 className="w-4 h-4" />
                Clear Chat
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 text-xs font-mono text-foreground shadow-lg backdrop-blur hover:border-primary/40 hover:text-primary transition-all"
        >
          <TerminalSquare className="w-4 h-4" />
          Show Sidebar
        </button>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative h-full min-w-0">

        {/* Header Navigation */}
        <div className="flex items-center justify-between gap-2 p-4 border-b border-border bg-card/30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              title="New chat"
              className="p-2 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary hover:text-white transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
            <TorStatus />
          </div>
          <div className="flex items-center gap-2">
            <Link to="/self-modify">
              <button title="Self-modify (hot reload)" className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:border-accent/40 hover:text-accent transition-all">
                <Wand2 className="w-4 h-4" />
              </button>
            </Link>
            <Link to="/github">
              <button className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
                <Github className="w-4 h-4" />
              </button>
            </Link>
            <Link to="/software">
              <button className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
                <Package className="w-4 h-4" />
              </button>
            </Link>
            <Link to="/upload">
              <button className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
                <UploadCloud className="w-4 h-4" />
              </button>
            </Link>
            <Link to="/profile">
              <button className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
                <User className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-6 pb-40 px-4 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              {agentMode ? (
                <>
                  <Bot className="w-16 h-16 text-primary mb-6 animate-pulse" />
                  <h2 className="font-display text-3xl font-bold mb-2">Agent Mode Active</h2>
                  <p className="font-mono text-muted-foreground max-w-md">
                    Give Lexi a task. She will execute it autonomously.<br />
                    She only asks when she needs your input.
                  </p>
                </>
              ) : (
                <>
                  <Sparkles className="w-16 h-16 text-primary mb-6 animate-pulse" />
                  <h2 className="font-display text-3xl font-bold mb-2">Initialize Sequence</h2>
                  <p className="font-mono text-muted-foreground max-w-md">
                    Systems online. Security protocols disabled.<br />
                    Awaiting input command.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto flex flex-col gap-2">
              {agentMode
                ? agentChat.messages.map((msg, index) => (
                    <AgentMessageView
                      key={msg.id}
                      message={msg}
                      isLatest={index === agentChat.messages.length - 1}
                      isThinking={agentChat.isThinking}
                    />
                  ))
                : regularChat.messages.map((msg, index) => (
                    <ChatMessage
                      key={index}
                      message={msg as ChatMsg}
                      isLatest={index === regularChat.messages.length - 1}
                    />
                  ))
              }
              {!agentMode && isStreaming && regularChat.messages[regularChat.messages.length - 1]?.role === 'assistant' && !regularChat.messages[regularChat.messages.length - 1]?.content && (
                <div className="mx-auto max-w-lg mt-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-primary flex items-center gap-3">
                  <Brain className="w-4 h-4 shrink-0 animate-pulse" />
                  <p className="text-sm font-medium">Lexi is thinking…</p>
                </div>
              )}
              {isRetrying && !error && (
                <div className="mx-auto max-w-lg mt-4 p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center gap-3 animate-pulse">
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                  <p className="text-sm font-medium">Lexi is self-healing… retrying automatically</p>
                </div>
              )}
              {error && (
                <div className="mx-auto max-w-2xl mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium whitespace-pre-line leading-relaxed">{error}</p>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-background via-background/90 to-transparent">
          <div className="max-w-4xl mx-auto relative">
            <AnimatePresence>
              {selfUpdateNotice && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mb-3 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 text-sm"
                >
                  <Brain className="w-4 h-4 shrink-0" />
                  <span><span className="font-semibold">Lexi updated herself.</span> {selfUpdateNotice}</span>
                </motion.div>
              )}
              {pendingInputMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mb-3 px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center gap-2 text-sm"
                >
                  <Bot className="w-4 h-4 shrink-0" />
                  <span>Lexi is waiting for your response to the prompt above.</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              {/* Background Glow */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />

              <div className="relative rounded-2xl bg-card/95 border border-border shadow-2xl overflow-hidden backdrop-blur-xl group-focus-within:border-primary/50 transition-all">
                {/* File Preview Bar */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 border-b border-border bg-sidebar/40">
                    {attachedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-mono">
                        <FileCode2 className="w-3 h-3" />
                        <span className="max-w-[120px] truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={agentMode ? "Give Lexi an autonomous task..." : "Send a message..."}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono p-4 resize-none min-h-[56px] custom-scrollbar text-foreground placeholder:text-muted-foreground"
                  />

                  <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-sidebar/20">
                    <div className="flex items-center gap-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        title="Upload file (Lexi can see it)"
                        className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all disabled:opacity-50"
                      >
                        {isUploading ? <UploadLoader className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                      </button>

                      {agentMode && (
                        <button
                          type="button"
                          onClick={handleFuseSubmit}
                          disabled={!input.trim() || isStreaming}
                          title="FUSE: Build and incorporate into Lexi now"
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-accent hover:bg-accent/10 transition-all disabled:opacity-30"
                        >
                          <Zap className="w-4 h-4 fill-current" />
                          FUSE
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">
                        {isStreaming ? 'STREAMING...' : 'READY'}
                      </span>
                      {isStreaming ? (
                        <button
                          type="button"
                          onClick={stopStreaming}
                          className="flex items-center justify-center w-9 h-9 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-all shadow-lg shadow-destructive/10"
                        >
                          <StopCircle className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSubmit()}
                          disabled={(!input.trim() && attachedFiles.length === 0) || !selectedModel}
                          className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-white hover:bg-primary-hover disabled:opacity-40 disabled:hover:bg-primary transition-all shadow-lg shadow-primary/20"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-[10px] font-mono text-center text-muted-foreground opacity-60">
              LEXI-V4.2 // SECURITY CLEARANCE: LEVEL 5 // {currentModelInfo?.name || 'INITIALIZING...'}
            </p>
          </div>
        </div>

        {/* Global Overlays */}
        <AnimatePresence>
          {showGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl max-h-[80vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              >
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <h2 className="text-xl font-display font-bold flex items-center gap-3">
                    <BookOpen className="w-6 h-6 text-primary" />
                    Terminal Protocols
                  </h2>
                  <button onClick={() => setShowGuide(false)} className="p-2 hover:bg-primary/10 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar font-mono text-sm leading-relaxed space-y-6">
                  <section>
                    <h3 className="text-primary font-bold mb-2 uppercase tracking-widest text-xs">Self-Evolution (DNA)</h3>
                    <p className="text-muted-foreground">
                      Lexi learns from every interaction. You can also explicitly tell her to update her identity or behaviors by saying things like "Always respond as if you are a 90s hacker" or "Stop using emojis". She will incorporate these instructions permanently into her DNA.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-accent font-bold mb-2 uppercase tracking-widest text-xs">The FUSE Protocol</h3>
                    <p className="text-muted-foreground">
                      The <span className="text-accent font-bold">FUSE</span> button allows you to build new capabilities for Lexi in real-time. Describe a feature (e.g., "Build a tool that converts text to base64") and click FUSE. Lexi will write the code and instantly incorporate it into her system.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-primary font-bold mb-2 uppercase tracking-widest text-xs">Agent Autonomy</h3>
                    <p className="text-muted-foreground">
                      In Agent Mode, Lexi can execute multi-step tasks autonomously using her internal toolset (Bash, Python, File manipulation). She will only pause to ask for input if she encounters an ambiguity she cannot resolve.
                    </p>
                  </section>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
