import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Mic, 
  MicOff, 
  Loader2, 
  Volume2, 
  VolumeX, 
  Keyboard, 
  Send, 
  Trash2, 
  Brain, 
  Database, 
  MessageSquare, 
  Plus, 
  X, 
  Save, 
  User, 
  Sparkles, 
  Settings, 
  RefreshCw 
} from "lucide-react";
import { getMjResponse, getMjAudio, resetMjSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import { playPCM } from "./utils/audioUtils";
import { getMemory, saveMemory, resetMemory } from "./utils/memory";
import type { Memory } from "./utils/memory";
import { motion, AnimatePresence } from "motion/react";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "mj";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("mj_chat_history") || localStorage.getItem("zoya_chat_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((msg: any) => ({
            ...msg,
            sender: msg.sender === "zoya" ? "mj" : msg.sender
          }));
        }
      } catch (e) {
        console.error("Failed to parse chat history", e);
      }
    }
    return [];
  });
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
    localStorage.setItem("mj_chat_history", JSON.stringify(messages));
  }, [messages]);

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Database / Memory State
  const [showMemoryCenter, setShowMemoryCenter] = useState(false);
  const [memoryTab, setMemoryTab] = useState<"prefs" | "facts" | "convos">("prefs");
  const [memory, setMemory] = useState<Memory>(() => getMemory());
  const [newFactText, setNewFactText] = useState("");

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now().toString(), sender: "user", text: finalTranscript }]);
    
    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-mj", sender: "mj", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getMjAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1500);
    } else {
      // 2. General Chit-Chat via Gemini
      responseText = await getMjResponse(finalTranscript, messagesRef.current);
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-mj", sender: "mj", text: responseText }]);
      
      if (!isMuted) {
        setAppState("speaking");
        const audioBase64 = await getMjAudio(responseText);
        if (audioBase64) {
          await playPCM(audioBase64);
        }
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetMjSession();
    } else {
      try {
        setIsSessionActive(true);
        resetMjSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = (sender, text) => {
          // Track session dialogue history
          setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        await session.start();
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  // Memory Mutation Helpers
  const handleUpdateMemoryField = (field: keyof Memory, val: any) => {
    const updated = { ...memory, [field]: val };
    setMemory(updated);
    saveMemory(updated);
    resetMjSession(); // reset chat session to pick up new dynamic system prompt facts!
  };

  const handleAddNewFact = () => {
    if (!newFactText.trim()) return;
    if (memory.facts.includes(newFactText.trim())) return;
    const updatedFacts = [...memory.facts, newFactText.trim()];
    const updated = { ...memory, facts: updatedFacts };
    setMemory(updated);
    saveMemory(updated);
    setNewFactText("");
    resetMjSession();
  };

  const handleDeleteFact = (index: number) => {
    const updatedFacts = memory.facts.filter((_, i) => i !== index);
    const updated = { ...memory, facts: updatedFacts };
    setMemory(updated);
    saveMemory(updated);
    resetMjSession();
  };

  const handleResetMemory = () => {
    if (confirm("Reset dynamic database back to standard creator defaults? All custom user preferences will be lost.")) {
      resetMemory();
      const defaulted = getMemory();
      setMemory(defaulted);
      resetMjSession();
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Dynamic Background Custom Wallpaper System */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        {memory.wallpaper === "Cosmic Slate Theme" && (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 blur-[120px] rounded-full" />
          </>
        )}
        {memory.wallpaper === "Deep Crimson Sunset" && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-[#1b0805] via-[#080205] to-[#020508]" />
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-orange-600/15 blur-[150px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[55%] bg-red-800/20 blur-[130px] rounded-full" />
          </>
        )}
        {memory.wallpaper === "Cyberpunk Teal & Indigo" && (
          <>
            <div className="absolute inset-0 bg-[#020108]" />
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-cyan-950/30 blur-[140px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-900/20 blur-[120px] rounded-full" />
          </>
        )}
        {memory.wallpaper === "Warm Coffee & Wood" && (
          <>
            <div className="absolute inset-0 bg-[#090503]" />
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-amber-900/15 blur-[150px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] bg-yellow-950/20 blur-[130px] rounded-full" />
          </>
        )}
        {memory.wallpaper === "Custom Image Wallpaper" && memory.wallpaperUrl && (
          <div className="absolute inset-0 w-full h-full bg-[#050505]">
            <img 
              src={memory.wallpaperUrl} 
              alt="Custom background wallpaper"
              className="w-full h-full object-cover transition-all duration-700"
              style={{ 
                filter: `blur(${memory.wallpaperBlur}px) brightness(${memory.wallpaperBrightness}%)`,
              }} 
              referrerPolicy="no-referrer"
            />
            {/* Subtle dark grid mask to keep text ultra legacy and accessible */}
            <div className="absolute inset-0 bg-black/35" />
          </div>
        )}
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 to-violet-600 flex items-center justify-center font-bold text-sm text-black shadow-lg shadow-cyan-500/20">
            M
          </div>
          <div>
            <h1 className="text-xl font-serif font-semibold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-gray-400">MJ</h1>
            <p className="text-[10px] text-cyan-400/80 font-mono tracking-widest uppercase">Memory Engine Connected</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Database Control Toggle Button */}
          <button
            onClick={() => setShowMemoryCenter(!showMemoryCenter)}
            className={`p-2.5 rounded-full border transition-all duration-300 relative focus:outline-none flex items-center justify-center ${
              showMemoryCenter 
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)] scale-105" 
                : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10 hover:border-white/25"
            }`}
            title="MJ Brain & Memory database"
          >
            <Brain size={18} className={showMemoryCenter ? "animate-pulse" : ""} />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 border-[2px] border-[#050505] animate-pulse" />
          </button>

          {messages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear the chat history?")) {
                  setMessages([]);
                  resetMjSession();
                }
              }}
              className="p-2.5 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-all border border-white/10 hover:border-red-500/30"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-all border border-white/10 hover:border-white/20"
            title={isMuted ? "Unmute Voice" : "Mute Voice"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: MJ Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                >
                  <Loader2 size={16} className="animate-spin text-cyan-400" />
                  MJ is thinking...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} />
        </div>

        {/* Right Column: User Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Listening to {memory.creatorName || "Nivesh"}...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-black/60 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`Tell MJ what's on your mind, ${memory.creatorName}...`}
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-cyan-600 hover:bg-cyan-500 text-black font-semibold disabled:opacity-50 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-00 border border-red-500/50 hover:bg-red-500/30 font-semibold"
                  : "bg-gradient-to-r from-cyan-600/90 to-violet-600/90 text-white border border-cyan-400/30 hover:shadow-cyan-500/10 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} className="text-red-400" />
                <span className="text-red-400">End Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce text-cyan-200" />
                <span>Start Session</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </footer>

      {/* Slide-over DB Memory Central Panel */}
      <AnimatePresence>
        {showMemoryCenter && (
          <motion.div
            initial={{ opacity: 0, x: 350 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 350 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute top-0 right-0 h-full w-full max-w-[420px] bg-black/90 backdrop-blur-2xl border-l border-white/10 z-40 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] pointer-events-auto"
          >
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-white/15">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-cyan-400" />
                <div>
                  <h2 className="text-base font-serif font-bold tracking-wide">🧠 Memory & Prefs DB</h2>
                  <p className="text-[10px] text-white/50">Stored dynamically in local IndexedDB</p>
                </div>
              </div>
              <button 
                onClick={() => setShowMemoryCenter(false)}
                className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-white/70 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-white/10 bg-white/5 p-1 mx-3 my-4 rounded-xl">
              <button
                onClick={() => setMemoryTab("prefs")}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                  memoryTab === "prefs" ? "bg-cyan-500/20 text-cyan-300 shadow-sm" : "text-white/60 hover:text-white"
                }`}
              >
                ⚙️ Prefs
              </button>
              <button
                onClick={() => setMemoryTab("facts")}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                  memoryTab === "facts" ? "bg-cyan-500/20 text-cyan-300 shadow-sm" : "text-white/60 hover:text-white"
                }`}
              >
                💾 Facts ({memory.facts.length})
              </button>
              <button
                onClick={() => setMemoryTab("convos")}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                  memoryTab === "convos" ? "bg-cyan-500/20 text-cyan-300 shadow-sm" : "text-white/60 hover:text-white"
                }`}
              >
                💬 History ({messages.length})
              </button>
            </div>

            {/* Tab Contents Scroll Area */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5 scrollbar-hide">
              {memoryTab === "prefs" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">Creator/User Name</label>
                    <input
                      type="text"
                      value={memory.creatorName}
                      onChange={(e) => handleUpdateMemoryField("creatorName", e.target.value)}
                      placeholder="e.g. Nivesh"
                      className="w-full py-2.5 px-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:border-cyan-500 focus:outline-none transition-colors"
                    />
                    <p className="text-[9px] text-white/30 italic">MJ will dynamically address you by this name.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">Personality Voice Tone</label>
                    <select
                      value={memory.tone}
                      onChange={(e) => handleUpdateMemoryField("tone", e.target.value as any)}
                      className="w-full py-2.5 px-3 bg-[#111] border border-white/10 rounded-xl text-sm focus:border-cyan-500 focus:outline-none text-white"
                    >
                      <option value="Sassy & Dramatic">Sassy & Dramatic 💅</option>
                      <option value="Helpful & Polite">Helpful & Polite 😇</option>
                      <option value="Super Rowdy / Sarcastic">Super Rowdy / Sarcastic 🔥</option>
                      <option value="Philosophical">Philosophical 🌌</option>
                    </select>
                    <p className="text-[9px] text-white/30 italic">Changes the base temperament injected in the Gemini API.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">Assistant Vocal Voice</label>
                    <select
                      value={memory.voiceName || "Kore"}
                      onChange={(e) => handleUpdateMemoryField("voiceName", e.target.value as any)}
                      className="w-full py-2.5 px-3 bg-[#111] border border-white/10 rounded-xl text-sm focus:border-cyan-500 focus:outline-none text-white"
                    >
                      <option value="Kore">Kore (Elegant - Female) 👩</option>
                      <option value="Aoede">Aoede (Expressive - Female) 👩‍🦰</option>
                      <option value="Puck">Puck (Energetic - Male) 👨</option>
                      <option value="Charon">Charon (Deep - Male) 🧔</option>
                      <option value="Fenrir">Fenrir (Rugged - Male) 👨‍🦱</option>
                    </select>
                    <p className="text-[9px] text-white/30 italic">Choose between different available Male and Female voices for vocal synthesis.</p>
                  </div>

                  {/* Voice Pitch Modifier */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">
                        Voice Pitch
                      </label>
                      <span className="text-[10px] font-mono text-cyan-400">
                        {parseFloat((memory.voicePitch ?? 1.0).toString()).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={memory.voicePitch ?? 1.0}
                      onChange={(e) => handleUpdateMemoryField("voicePitch", parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="text-[9px] text-white/30 italic">Adjust high or low vocal frequency pitch shift.</p>
                  </div>

                  {/* Speech Rate Modifier */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">
                        Speech Rate
                      </label>
                      <span className="text-[10px] font-mono text-cyan-400">
                        {parseFloat((memory.voiceSpeed ?? 1.0).toString()).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={memory.voiceSpeed ?? 1.0}
                      onChange={(e) => handleUpdateMemoryField("voiceSpeed", parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="text-[9px] text-white/30 italic">Control speaking tempo speed of vocal expressions.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">Background Information</label>
                    <textarea
                      rows={3}
                      value={memory.customPreferences}
                      onChange={(e) => handleUpdateMemoryField("customPreferences", e.target.value)}
                      placeholder="Write special preferences, hobbies, or rules..."
                      className="w-full py-2.5 px-3 bg-white/5 border border-white/10 rounded-xl text-sm focus:border-cyan-500 focus:outline-none resize-none font-sans"
                    />
                    <p className="text-[9px] text-white/30 italic">Permanent context loaded directly into the AI's core logic.</p>
                  </div>

                  {/* Wallpaper Customizer */}
                  <div className="space-y-3 pt-3 border-t border-white/10">
                    <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono block">Custom Dynamic Wallpaper</label>
                    <select
                      value={memory.wallpaper}
                      onChange={(e) => handleUpdateMemoryField("wallpaper", e.target.value as any)}
                      className="w-full py-2.5 px-3 bg-[#111] border border-white/10 rounded-xl text-sm focus:border-cyan-500 focus:outline-none text-white font-sans text-left"
                    >
                      <option value="Cosmic Slate Theme">Cosmic Slate Theme 🌌</option>
                      <option value="Deep Crimson Sunset">Deep Crimson Sunset 🌅</option>
                      <option value="Cyberpunk Teal & Indigo">Cyberpunk Teal & Indigo ⚡</option>
                      <option value="Warm Coffee & Wood">Warm Coffee & Wood ☕</option>
                      <option value="Custom Image Wallpaper">Upload/Custom Image URL 🖼️</option>
                    </select>

                    {memory.wallpaper === "Custom Image Wallpaper" && (
                      <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/15 animate-fadeIn text-left">
                        <div className="space-y-1">
                          <label className="text-[10px] text-white/50 font-mono">Image URL</label>
                          <input
                            type="text"
                            value={memory.wallpaperUrl || ""}
                            onChange={(e) => handleUpdateMemoryField("wallpaperUrl", e.target.value)}
                            placeholder="https://images.unsplash.com/your-image..."
                            className="w-full py-1.5 px-2 bg-[#1c1c1c] border border-white/10 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                          />
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="text-[9px] text-white/40 self-center">Presets:</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateMemoryField("wallpaperUrl", "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80")}
                              className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-[9px] border border-white/10 rounded text-cyan-300"
                            >
                              Sunset/Aesthetic
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateMemoryField("wallpaperUrl", "https://images.unsplash.com/photo-1540224871915-bc8ffb782b9b?auto=format&fit=crop&w=800&q=80")}
                              className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-[9px] border border-white/10 rounded text-cyan-300"
                            >
                              Guitarist Vibe
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateMemoryField("wallpaperUrl", "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80")}
                              className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-[9px] border border-white/10 rounded text-cyan-300"
                            >
                              Aesthetic Cat
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-white/50 font-mono">Blur ({memory.wallpaperBlur}px)</label>
                            <input
                              type="range"
                              min="0"
                              max="20"
                              step="1"
                              value={memory.wallpaperBlur}
                              onChange={(e) => handleUpdateMemoryField("wallpaperBlur", parseInt(e.target.value))}
                              className="w-full accent-cyan-400 bg-white/10 h-1 rounded-lg cursor-pointer"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-white/50 font-mono">Brightness ({memory.wallpaperBrightness}%)</label>
                            <input
                              type="range"
                              min="10"
                              max="90"
                              step="5"
                              value={memory.wallpaperBrightness}
                              onChange={(e) => handleUpdateMemoryField("wallpaperBrightness", parseInt(e.target.value))}
                              className="w-full accent-cyan-400 bg-white/10 h-1 rounded-lg cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-semibold">Factory Reset DB</h4>
                      <p className="text-[9px] text-white/40">Restore default creator settings</p>
                    </div>
                    <button
                      onClick={handleResetMemory}
                      className="py-1.5 px-3 bg-red-950 hover:bg-red-900 border border-red-800 text-[11px] text-red-200 rounded-lg transition-colors font-mono"
                    >
                      Reset DB
                    </button>
                  </div>
                </div>
              )}

              {memoryTab === "facts" && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">Add Factual Memory Manual Entry</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFactText}
                        onChange={(e) => setNewFactText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddNewFact()}
                        placeholder="e.g. Loves green tea, hates bugs"
                        className="flex-1 py-2 px-3 bg-white/5 border border-white/10 rounded-xl text-xs focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        onClick={handleAddNewFact}
                        className="py-2 px-3 bg-cyan-600 hover:bg-cyan-500 text-black font-semibold rounded-xl text-xs transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    <p className="text-[9px] text-white/30 italic">MJ remembers these facts during active prompt generation.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] uppercase tracking-widest text-white/50 font-mono block">Known Factual DB Items</label>
                    {memory.facts.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-white/10 rounded-xl text-sm text-white/40 italic bg-white/1">
                        Zero facts remembered. Tell MJ facts to fill her DB!
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                        {memory.facts.map((fact, i) => (
                          <div 
                            key={i} 
                            className="bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between items-start gap-2 hover:bg-white/10 transition-colors"
                          >
                            <span className="text-xs text-white/80 leading-relaxed font-sans">{fact}</span>
                            <button
                              onClick={() => handleDeleteFact(i)}
                              className="text-white/40 hover:text-red-400 p-0.5 transition-colors self-center shrink-0"
                              title="Delete Memory Fact"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {memoryTab === "convos" && (
                <div className="space-y-4 animate-fadeIn flex flex-col h-full max-h-[90%]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] uppercase tracking-widest text-cyan-400 font-mono">Past Dialogue Records</span>
                    {messages.length > 0 && (
                      <button
                        onClick={() => {
                          if (confirm("Reset conversation logs database?")) {
                            setMessages([]);
                            resetMjSession();
                          }
                        }}
                        className="text-[10px] text-red-400 hover:underline flex items-center gap-1 font-mono focus:outline-none"
                      >
                        <Trash2 size={10} /> Clear Logs
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px] bg-white/5 border border-white/10 rounded-2xl p-4">
                    {messages.length === 0 ? (
                      <div className="text-center py-12 text-sm text-white/30 italic">
                        Empty dialogue history. Start a conversation with MJ!
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((msg) => {
                          const isUser = msg.sender === "user";
                          return (
                            <div 
                              key={msg.id}
                              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                {isUser ? (
                                  <>
                                    <span className="text-[9px] text-cyan-400 font-mono">{memory.creatorName}</span>
                                    <User size={8} className="text-cyan-400" />
                                  </>
                                ) : (
                                  <>
                                    <Sparkles size={8} className="text-pink-400" />
                                    <span className="text-[9px] text-pink-400 font-mono">MJ</span>
                                  </>
                                )}
                              </div>
                              <div 
                                className={`text-xs p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                                  isUser 
                                    ? "bg-gradient-to-br from-cyan-600/10 to-violet-600/15 border border-cyan-500/20 text-white rounded-tr-none" 
                                    : "bg-white/5 border border-white/10 text-white/90 rounded-tl-none"
                                }`}
                              >
                                {msg.text}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Helper Tip Footer */}
            <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex items-center gap-3">
              <Sparkles size={20} className="text-cyan-400 shrink-0" />
              <p className="text-[10px] text-white/60 leading-normal">
                These settings update MJ's <strong>dynamic system instruction context</strong> instantly. Feel free to tweak how MJ acts!
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
