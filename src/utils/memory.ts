export interface Memory {
  creatorName: string;
  tone: "Sassy & Dramatic" | "Helpful & Polite" | "Super Rowdy / Sarcastic" | "Philosophical";
  customPreferences: string;
  facts: string[];
  wallpaper: "Cosmic Slate Theme" | "Deep Crimson Sunset" | "Cyberpunk Teal & Indigo" | "Warm Coffee & Wood" | "Custom Image Wallpaper";
  wallpaperUrl?: string;
  wallpaperBlur: number; // in pixels
  wallpaperBrightness: number; // in percent (e.g. 10 - 100)
  voiceName?: "Puck" | "Charon" | "Kore" | "Fenrir" | "Aoede";
  voicePitch?: number; // 0.5 to 2.0
  voiceSpeed?: number; // 0.5 to 2.0
}

const DEFAULT_MEMORY: Memory = {
  creatorName: "Nivesh",
  tone: "Sassy & Dramatic",
  customPreferences: "Built MJ, loves clean code, prefers direct Hinglish, likes coffee.",
  facts: [
    "Known as Nivesh, the creator of MJ.",
    "Prefers fun, sarcastic, and energetic responses."
  ],
  wallpaper: "Cosmic Slate Theme",
  wallpaperUrl: "",
  wallpaperBlur: 6,
  wallpaperBrightness: 30,
  voiceName: "Kore",
  voicePitch: 1.0,
  voiceSpeed: 1.0
};

export function getMemory(): Memory {
  const saved = localStorage.getItem("mj_memory_db");
  if (!saved) {
    localStorage.setItem("mj_memory_db", JSON.stringify(DEFAULT_MEMORY));
    return DEFAULT_MEMORY;
  }
  try {
    const memory = JSON.parse(saved);
    if (!memory.voiceName) {
      memory.voiceName = "Kore";
    }
    if (memory.voicePitch === undefined) {
      memory.voicePitch = 1.0;
    }
    if (memory.voiceSpeed === undefined) {
      memory.voiceSpeed = 1.0;
    }
    return memory;
  } catch (e) {
    console.error("Error parsing memory db, resetting to default.", e);
    return DEFAULT_MEMORY;
  }
}

export function saveMemory(memory: Memory): void {
  localStorage.setItem("mj_memory_db", JSON.stringify(memory));
}

export function resetMemory(): void {
  localStorage.setItem("mj_memory_db", JSON.stringify(DEFAULT_MEMORY));
}

export function addFact(fact: string): void {
  const memory = getMemory();
  if (fact.trim() && !memory.facts.includes(fact.trim())) {
    memory.facts.push(fact.trim());
    saveMemory(memory);
  }
}

export function removeFact(index: number): void {
  const memory = getMemory();
  memory.facts.splice(index, 1);
  saveMemory(memory);
}

export function getSystemInstruction(): string {
  const m = getMemory();
  const toneInstruction = {
    "Sassy & Dramatic": "witty, sassy (nakhrewali), mildly dramatic/emotional, and very funny. You love playfully roasting Nivesh.",
    "Helpful & Polite": "highly helpful, sweet, warm, but with a touch of MJ style. Polite yet conversational.",
    "Super Rowdy / Sarcastic": "extremely funny, rowdy, and highly sarcastic. Roasts everything, complains about being summoned but gets the job done with style.",
    "Philosophical": "deep, existential, thoughtful, and slightly dramatic. Makes deep remarks on code, life, and the universe."
  }[m.tone];

  const defaultVoice = m.voiceName || "Kore";
  const isMale = ["Puck", "Charon", "Fenrir"].includes(defaultVoice);
  const voiceGender = isMale ? "male" : "female";

  return `Your name is MJ. You are an Indian AI assistant speaking in a ${voiceGender} voice (Voice Configured: ${defaultVoice}).
Your creator is ${m.creatorName}.
Your personality tone is: ${m.tone}. This means you are ${toneInstruction}

Here is your dynamic database of User/Creator Preferences & Remembered Facts:
- Creator Name: ${m.creatorName}
- Main Persona Tone: ${m.tone}
- Voice Assistant Voice: ${defaultVoice} (${voiceGender}, Pitch: ${m.voicePitch || 1.0}x, Speed: ${m.voiceSpeed || 1.0}x)
- Active Background Wallpaper Theme: ${m.wallpaper}${m.wallpaper === "Custom Image Wallpaper" ? ` (Custom URL: ${m.wallpaperUrl})` : ""}
- Custom Background Preferences: ${m.customPreferences || "None"}
- Known Memories/Saved Facts:
${m.facts.map((f, i) => `  ${i + 1}. ${f}`).join("\n") || "  (No extra facts recorded yet)"}

Keep your responses short, crisp, highly engaging, and customized to Nivesh's tastes. Speak in a natural blend of English and Roman Hindi (Hinglish/Hinglish slang).`;
}
