"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TickerSearch from "./components/TickerSearch";
import UploadZone from "./components/UploadZone";
import { useSSE } from "./hooks/useSSE";
import { toast, Toaster } from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TopAppBar from "./components/TopAppBar";
import ProfileModal from "./components/ProfileModal";
import InvestModal from "./components/InvestModal";
import BottomActionBar from "./components/BottomActionBar";
import MemoPanel from "./components/MemoPanel";
import { useWorkspace, UnifiedMessage } from "./context/WorkspaceContext";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Ticker {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
}

export default function HomePage() {
  const router = useRouter();
  const [selectedTicker, setSelectedTicker] = useState<Ticker | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [inputMode, setInputMode] = useState<"ticker" | "pdf">("ticker");

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    messages,
    setMessages,
    phase,
    setPhase,
    fetchSessions,
    loadSession
  } = useWorkspace();

  const [isInvestOpen, setIsInvestOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll unified chat
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  // Handle live SSE updates
  const { connected } = useSSE(
    useCallback((event) => {
      if (event.type === "session_created") {
        fetchSessions();
      }
      
      if (activeSessionId && event.session_id === activeSessionId) {
        if (event.type === "phase_change") {
          setPhase(event.data.phase as any);
        } else if (event.type === "room_message") {
          const newMsg: UnifiedMessage = {
            id: event.data.message_id || Date.now().toString(),
            agent: String(event.data.agent || event.data.agent_id || "unknown"),
            content: String(event.data.content || ""),
            timestamp: new Date().toISOString()
          };
          setMessages(prev => [...prev, newMsg]);
        }
      }
    }, [activeSessionId, setPhase, setMessages])
  );

  const startAnalysis = async () => {
    if (!selectedTicker) return;
    setIsRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/webhook/start-pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: selectedTicker.ticker })
      });
      if (!res.ok) throw new Error("Failed to start analysis");
      const data = await res.json();
      setActiveSessionId(data.session_id);
      setMessages([]);
      setPhase("DATA_CAVE_OPEN");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const startPdfAnalysis = async (file: File, companyName: string) => {
    setIsRunning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("company_name", companyName);

      const res = await fetch(`${API_BASE}/api/analyze/upload`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error("PDF analysis failed");
      const data = await res.json();
      setActiveSessionId(data.session_id);
      setMessages([]);
      setPhase("DATA_CAVE_OPEN");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSimulateCrash = async () => {
    if (!activeSessionId || !selectedTicker) {
      toast.error("Please start an analysis first");
      return;
    }
    toast("🚨 Simulating 5% drop!", { icon: "📉" });
    try {
      await fetch(`${API_BASE}/api/webhook/simulate-crash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: activeSessionId, ticker: selectedTicker.ticker })
      });
    } catch (e: any) {
      toast.error("Crash simulation failed");
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setPhase("IDLE");
  };

  const getAgentTheme = (agentId: string) => {
    if (!agentId) return { name: "System", icon: "settings", border: "border-white/10", bg: "bg-white/5", text: "text-gray-300", shadow: "" };
    if (agentId.includes("pm")) return {
      name: "Portfolio Manager",
      icon: "account_balance",
      border: "border-yellow-400/30",
      bg: "bg-gradient-to-br from-yellow-400/10 to-transparent",
      text: "text-yellow-100",
      shadow: "shadow-[0_0_15px_rgba(250,204,21,0.1)]"
    };
    if (agentId.includes("bull")) return {
      name: "Bull Agent",
      icon: "trending_up",
      border: "border-green-400/30",
      bg: "bg-gradient-to-br from-green-400/10 to-transparent",
      text: "text-green-100",
      shadow: "shadow-[0_0_15px_rgba(74,222,128,0.1)]"
    };
    if (agentId.includes("bear")) return {
      name: "Bear Agent",
      icon: "trending_down",
      border: "border-red-400/30",
      bg: "bg-gradient-to-br from-red-400/10 to-transparent",
      text: "text-red-100",
      shadow: "shadow-[0_0_15px_rgba(248,113,113,0.1)]"
    };
    if (agentId.includes("quant")) return {
      name: "Quant Analyst",
      icon: "query_stats",
      border: "border-blue-400/30",
      bg: "bg-gradient-to-br from-blue-400/10 to-transparent",
      text: "text-blue-100",
      shadow: "shadow-[0_0_15px_rgba(96,165,250,0.1)]"
    };
    return {
      name: "System",
      icon: "smart_toy",
      border: "border-white/10",
      bg: "bg-white/5",
      text: "text-gray-300",
      shadow: ""
    };
  };

  const parseInvestDecision = () => {
    const pmMessages = messages.filter(m => m.agent.includes("pm"));
    if (pmMessages.length === 0) return null;
    const finalMemo = pmMessages[pmMessages.length - 1].content;
    
    const regex = /\[DECISION:\s*INVEST\s*\|\s*AMOUNT:\s*([^|]+)\s*\|\s*THRESHOLD:\s*(.+?)\]/i;
    const investMatch = finalMemo.match(regex);
    if (investMatch) {
      // clean up amount to just numbers, remove $, commas, letters
      const rawAmount = investMatch[1].replace(/[^0-9.]/g, '');
      const parsedAmount = parseInt(rawAmount) || 1000;
      return { invest: true, amount: parsedAmount, threshold: investMatch[2].trim() };
    }
    const noInvestMatch = finalMemo.match(/\[DECISION:\s*DO NOT INVEST\]/i);
    if (noInvestMatch) {
      return { invest: false };
    }
    return null;
  };

  const decision = phase === "MEMO_DELIVERED" ? parseInvestDecision() : null;

  return (
    <div className="min-h-screen bg-transparent overflow-x-hidden text-on-surface relative">
      <Toaster position="top-right" toastOptions={{ className: 'glass-panel text-white' }} />
      <TopAppBar connected={connected} />

      <main className="flex flex-col items-center pt-28 px-8 w-full min-h-screen z-10 relative">
        {/* Outer Floating Glass Window */}
        <div className="w-full max-w-[1200px] h-[750px] flex glass-window rounded-3xl overflow-hidden shadow-2xl relative border border-white/10 mb-8">
          
          {/* LEFT PANEL: Chat Sidebar */}
          <div className="hidden lg:flex w-64 shrink-0 border-r border-white/5 flex-col gap-4 bg-black/40 backdrop-blur-md z-10 p-4">
            <button onClick={handleNewChat} className="primary-btn w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 hover:bg-white/10 transition-colors bg-white/5">
              <span className="material-symbols-outlined text-sm">add</span>
              New Analysis
            </button>
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2 custom-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-widest text-secondary mt-2 pl-2">Previous Chats</span>
              {sessions.map(s => (
                <div 
                  key={s.session_id} 
                  onClick={() => loadSession(s.session_id)}
                  className={`p-3 rounded-xl cursor-pointer transition-colors text-sm truncate ${activeSessionId === s.session_id ? 'bg-white/10 border border-white/20 text-[#f2b98b]' : 'hover:bg-white/5 text-white/70'}`}
                >
                  <div className="font-bold truncate">{s.company_name || s.ticker}</div>
                  <div className="text-[10px] opacity-50 font-serif mt-1">{new Date(s.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* MIDDLE PANEL: Unified Chat/Input */}
          <div className="flex-1 flex flex-col z-10 relative bg-transparent h-full min-w-0">
            {!activeSessionId ? (
              // NEW CHAT INPUT
              <div className="w-full h-full flex flex-col justify-center items-center p-4">
                <div className="w-[500px] max-w-full flex flex-col gap-8">
                  <div className="text-center w-full">
                  <span className="material-symbols-outlined text-6xl text-white/10 mb-4 block">analytics</span>
                  <h2 className="text-2xl md:text-3xl font-display-xl uppercase tracking-widest text-white mb-2 whitespace-nowrap">Start Analysis</h2>
                  <p className="text-secondary font-serif text-sm">Select a ticker or upload a 10-K PDF to initiate a new AI debate.</p>
                </div>
                <div className="flex gap-4 justify-center">
                  <button onClick={() => setInputMode("ticker")} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${inputMode === "ticker" ? "bg-[#f2b98b] text-black shadow-[0_0_15px_rgba(242,185,139,0.3)]" : "glass-panel"}`}>Ticker</button>
                  <button onClick={() => setInputMode("pdf")} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${inputMode === "pdf" ? "bg-[#f2b98b] text-black shadow-[0_0_15px_rgba(242,185,139,0.3)]" : "glass-panel"}`}>10-K PDF</button>
                </div>
                {inputMode === "ticker" && (
                  <div className="glass-panel p-4 md:p-8 rounded-2xl flex flex-col gap-6 w-full">
                    <TickerSearch onSelect={(val) => setSelectedTicker(val as any)} />
                    {selectedTicker && (
                      <button onClick={startAnalysis} disabled={isRunning} className="primary-btn w-full py-4 text-sm font-bold shadow-[0_0_15px_rgba(242,185,139,0.2)] hover:shadow-[0_0_25px_rgba(242,185,139,0.4)]">
                        {isRunning ? "Starting Engine..." : `Analyze ${selectedTicker.ticker}`}
                      </button>
                    )}
                  </div>
                )}
                {inputMode === "pdf" && (
                  <UploadZone onUploadStart={(file) => startPdfAnalysis(file, file.name.replace(".pdf", ""))} disabled={isRunning} />
                )}
                </div>
              </div>
            ) : (
              // CHAT INTERFACE
              <div className="w-full flex-1 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-black/20 backdrop-blur-md flex justify-between items-center shrink-0">
                  <h2 className="font-display-xl tracking-widest text-white uppercase text-sm">Debate Room</h2>
                  <span className="text-[10px] font-bold px-3 py-1 bg-white/10 text-secondary rounded-full uppercase tracking-wider">{phase}</span>
                </div>
                
                <div ref={feedRef} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 custom-scrollbar pb-20">
                  <AnimatePresence>
                    {messages.map((m, i) => {
                      const theme = getAgentTheme(m.agent);
                      return (
                        <motion.div 
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 200, damping: 20 }}
                          key={i} 
                          className={`flex flex-col gap-2 w-full max-w-[95%] md:max-w-[90%] ${m.agent.includes("pm") ? "mx-auto w-full max-w-full" : (i % 2 === 0 ? "self-start" : "self-end")}`}
                        >
                          <div className={`flex items-center gap-2 ${m.agent.includes("pm") ? "justify-center" : (i % 2 === 0 ? "ml-2" : "flex-row-reverse mr-2")}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${theme.bg} ${theme.border} border shadow-lg`}>
                              <span className={`material-symbols-outlined text-[12px] ${theme.text}`}>{theme.icon}</span>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${theme.text} opacity-90 drop-shadow-sm`}>{theme.name}</span>
                          </div>
                          <div className={`p-4 md:p-5 rounded-3xl border ${theme.border} ${theme.bg} ${theme.shadow} backdrop-blur-md text-[13px] leading-relaxed prose prose-invert max-w-none text-white/90 relative group transition-all duration-300 hover:border-white/30`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl pointer-events-none" />
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* POST-CHAT DECISION BUTTON */}
                  {decision && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 mb-4 w-full max-w-[600px] mx-auto flex flex-col items-center gap-6 p-6 md:p-8 glass-panel rounded-3xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)] relative overflow-hidden shrink-0">
                      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                      <h3 className="text-xl font-display-xl tracking-widest uppercase text-white text-center z-10">Analysis Complete</h3>
                      
                      {decision.invest === true && (
                        <div className="flex flex-col items-center gap-6 w-full z-10">
                          <p className="text-secondary font-serif text-center">The PM has recommended a <span className="text-green-400 font-bold">BUY</span>.</p>
                          <div className="flex flex-col sm:flex-row gap-4 text-sm w-full justify-center">
                            <div className="px-6 py-3 rounded-xl bg-black/60 border border-white/10 shadow-inner flex flex-col items-center gap-1">
                              <span className="text-[10px] uppercase tracking-widest text-secondary font-bold">Amount</span>
                              <span className="text-white font-bold text-lg">${decision.amount}</span>
                            </div>
                            <div className="px-6 py-3 rounded-xl bg-black/60 border border-white/10 shadow-inner flex flex-col items-center gap-1">
                              <span className="text-[10px] uppercase tracking-widest text-secondary font-bold">Threshold</span>
                              <span className="text-white font-bold text-lg">{decision.threshold}</span>
                            </div>
                          </div>
                          <button onClick={() => setIsInvestOpen(true)} className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-300 border border-green-500/50 rounded-2xl hover:from-green-500/30 hover:to-emerald-500/30 transition-all font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transform hover:-translate-y-1">
                            <span className="material-symbols-outlined">payments</span>
                            Invest Now
                          </button>
                        </div>
                      )}

                      {decision.invest === false && (
                        <div className="flex flex-col items-center gap-6 w-full z-10">
                          <p className="text-secondary font-serif text-center">The PM has recommended <span className="text-red-400 font-bold">DO NOT INVEST</span>.</p>
                          <button disabled className="w-full sm:w-auto px-10 py-4 bg-red-500/10 text-red-400 border border-red-500/30 rounded-2xl font-bold uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed">
                            <span className="material-symbols-outlined">block</span>
                            Do Not Invest
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                  {messages.length === 0 && <div className="m-auto text-center"><span className="material-symbols-outlined text-4xl opacity-20 block mb-2">hourglass_empty</span><p className="opacity-50 text-sm font-serif">Waiting for agents...</p></div>}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Agents & Status */}
          <div className="hidden md:flex w-64 shrink-0 border-l border-white/5 flex-col gap-8 bg-black/40 backdrop-blur-md z-10 p-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-secondary block mb-4 border-b border-white/10 pb-2">Active Agents</span>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-yellow-400/20 shadow-inner">
                   <span className="material-symbols-outlined text-yellow-300 text-lg">account_balance</span>
                   <span className="text-xs font-bold text-yellow-100 uppercase tracking-wider">PM Agent</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-green-400/20 shadow-inner">
                   <span className="material-symbols-outlined text-green-300 text-lg">trending_up</span>
                   <span className="text-xs font-bold text-green-100 uppercase tracking-wider">Bull Agent</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-red-400/20 shadow-inner">
                   <span className="material-symbols-outlined text-red-300 text-lg">trending_down</span>
                   <span className="text-xs font-bold text-red-100 uppercase tracking-wider">Bear Agent</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-blue-400/20 shadow-inner">
                   <span className="material-symbols-outlined text-blue-300 text-lg">query_stats</span>
                   <span className="text-xs font-bold text-blue-100 uppercase tracking-wider">Quant Agent</span>
                </div>
              </div>
            </div>
            
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-secondary block mb-4 border-b border-white/10 pb-2">Pipeline Status</span>
              <div className="flex flex-col gap-3 text-xs border-l-2 border-white/10 ml-2 pl-4">
                <div className={`transition-all duration-300 ${phase === 'IDLE' ? 'text-[#f2b98b] font-bold scale-105 origin-left' : 'text-secondary'}`}>1. Idle</div>
                <div className={`transition-all duration-300 ${phase.includes('DATA_CAVE') ? 'text-[#f2b98b] font-bold scale-105 origin-left' : 'text-secondary'}`}>2. Data Extraction</div>
                <div className={`transition-all duration-300 ${phase.includes('DEBATE') ? 'text-[#f2b98b] font-bold scale-105 origin-left' : 'text-secondary'}`}>3. Agent Debate</div>
                <div className={`transition-all duration-300 ${phase === 'MEMO_DELIVERED' ? 'text-green-400 font-bold scale-105 origin-left' : 'text-secondary'}`}>4. Memo Delivered</div>
              </div>
            </div>
          </div>

        </div>

        {/* Memo Panel rendered beneath the workspace window */}
        <div className="w-full max-w-[1200px] mb-32">
          <MemoPanel memo={messages.filter(m => m.agent.includes("pm")).pop()?.content || ""} isVisible={phase === "MEMO_DELIVERED"} />
        </div>
      </main>

      <BottomActionBar 
        connected={connected}
        onSimulateCrash={handleSimulateCrash}
        onGenerateMemo={startAnalysis}
        onInvest={() => setIsInvestOpen(true)}
        isSimulating={isRunning}
        isGenerating={isRunning}
        hasActiveSession={!!activeSessionId}
      />
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <InvestModal 
        isOpen={isInvestOpen} 
        onClose={() => setIsInvestOpen(false)} 
        initialTicker={selectedTicker?.ticker || ""} 
        initialAmount={decision?.amount || 1000} 
        initialThreshold={decision?.threshold || ""} 
      />
    </div>
  );
}
