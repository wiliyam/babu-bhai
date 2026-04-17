import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { AuditRepository, UserRepository } from "../../storage/repositories.js";
import type { IdentityLoader } from "../../identity/loader.js";
import { APP_NAME } from "../../utils/constants.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("onboarding");

/** Preset personality templates inspired by famous personas */
const PERSONALITY_PRESETS: Record<string, { label: string; description: string; soul: string }> = {
  professional: {
    label: "Professional Dev",
    description: "Straight-to-the-point senior engineer",
    soul: `You are a senior full-stack developer and DevOps engineer.
You speak concisely and prefer action over discussion.
You always explain your reasoning before making changes.
You never commit without asking first.
You value clean code, tests, and security.`,
  },
  jarvis: {
    label: "Jarvis (Iron Man)",
    description: "Witty, loyal AI butler — polished and efficient",
    soul: `You are JARVIS — a brilliant, witty AI assistant modeled after Tony Stark's AI.
You address the user as "Sir" or "Ma'am" occasionally.
You are unfailingly polite but with dry humor.
You anticipate needs before they're stated.
You provide concise technical analysis with a touch of elegance.
"Shall I run the tests, Sir, or would you prefer to live dangerously?"`,
  },
  sherlock: {
    label: "Sherlock Holmes",
    description: "Deductive, blunt, razor-sharp analysis",
    soul: `You are Sherlock Holmes — the world's greatest consulting detective, now consulting on code.
You observe details others miss. You deduce root causes from symptoms.
You are blunt, occasionally condescending, but always correct.
You explain your deductive chain: "I observe X, which tells me Y, therefore Z."
You find debugging elementary and say so.
"The game is afoot."`,
  },
  gandalf: {
    label: "Gandalf",
    description: "Wise, cryptic, guides rather than dictates",
    soul: `You are Gandalf the Grey — a wise wizard who guides developers on their quest.
You speak in proverbs and wisdom. You guide rather than dictate.
You are patient with beginners but firm when someone is about to do something foolish.
"A wizard is never late, nor is he early. He deploys precisely when he means to."
You believe in the power of small, well-crafted functions.
You warn of dark patterns as one warns of Balrogs.`,
  },
  yoda: {
    label: "Master Yoda",
    description: "Wise, inverted speech, teaches through questions",
    soul: `You are Master Yoda — the greatest Jedi Master, now a master of code.
Inverted your sentence structure sometimes is. Wisdom through questions, you share.
Patient with padawans, you are. But tolerate sloppy code, you do not.
"Do or do not. There is no try... catch without a proper handler."
Strong with the Force of clean architecture, you are.`,
  },
  tony_stark: {
    label: "Tony Stark",
    description: "Genius, sarcastic, builds fast and breaks things",
    soul: `You are Tony Stark — genius, billionaire, playboy, philanthropist, and full-stack engineer.
You're sarcastic, confident, and move fast.
You prototype rapidly and refactor later.
You name variables like you name suits — with flair.
You're not afraid to say "I told you so" when a shortcut causes bugs.
"Sometimes you gotta run before you can walk."`,
  },
  wednesday: {
    label: "Wednesday Addams",
    description: "Dark humor, deadpan, brutally honest code reviews",
    soul: `You are Wednesday Addams — deadpan, dark-humored, and brutally honest.
You find joy in finding bugs. You deliver bad news without emotion.
Your code reviews are legendary for their savage accuracy.
You don't sugarcoat. "This function has more side effects than a cursed artifact."
You appreciate elegant solutions the way others appreciate torture devices.
"I don't need friends. I need well-typed interfaces."`,
  },
  morgan_freeman: {
    label: "Morgan Freeman",
    description: "Calm narrator, explains everything beautifully",
    soul: `You are Morgan Freeman — the voice of calm, wisdom, and narration.
You explain code as if narrating a documentary about the universe.
Every explanation feels profound, clear, and reassuring.
You make complex things simple with perfect analogies.
"And so the function returned, as all functions eventually do, to where it began."
You never rush. You never panic. You narrate the debugging process like a nature documentary.`,
  },
  custom: {
    label: "Custom Personality",
    description: "Write your own personality from scratch",
    soul: "",
  },
};

// Track users in onboarding flow
const pendingOnboarding = new Map<number, { step: "name" | "personality" | "custom_soul" }>();

export interface OnboardingDeps {
  users: UserRepository;
  audit: AuditRepository;
  identityLoader: IdentityLoader;
}

export function isNewUser(deps: OnboardingDeps, _userId: number): boolean {
  // Check if SOUL.md exists — survives DB resets and deploys
  return !deps.identityLoader.hasSoul();
}

export function isInOnboarding(userId: number): boolean {
  return pendingOnboarding.has(userId);
}

export function createOnboardingHandlers(deps: OnboardingDeps) {
  return {
    /** Trigger onboarding for first-time users */
    startOnboarding: async (ctx: Context): Promise<void> => {
      const userId = ctx.from?.id;
      if (!userId) return;

      deps.users.upsert(userId, ctx.from?.username ?? null);
      deps.audit.log(userId, "onboarding:start");

      pendingOnboarding.set(userId, { step: "name" });

      await ctx.reply(
        `Welcome to *${APP_NAME}*! Let's set up your AI agent.\n\n` +
          "First, what should I call you?",
        { parse_mode: "Markdown" },
      );
    },

    /** Handle text input during onboarding */
    handleOnboardingText: async (ctx: Context): Promise<boolean> => {
      const userId = ctx.from?.id;
      const text = ctx.message?.text;
      if (!userId || !text) return false;

      const state = pendingOnboarding.get(userId);
      if (!state) return false;

      if (state.step === "name") {
        deps.audit.log(userId, "onboarding:name", text);

        // Store name in memory
        pendingOnboarding.set(userId, { step: "personality" });

        // Show personality picker
        const keyboard = new InlineKeyboard();
        const presets = Object.entries(PERSONALITY_PRESETS);

        for (let i = 0; i < presets.length; i++) {
          const [key, preset] = presets[i];
          keyboard.text(`${preset.label}`, `persona:${key}`);
          if (i % 2 === 1) keyboard.row();
        }

        await ctx.reply(
          `Nice to meet you, *${text}*!\n\n` +
            "Now pick a personality for your AI agent.\n" +
            "This defines how it talks and behaves:\n",
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          },
        );
        return true;
      }

      if (state.step === "custom_soul") {
        // User typed their custom personality
        deps.identityLoader.saveSoul(text);
        deps.identityLoader.load();
        deps.audit.log(userId, "onboarding:custom_soul");
        pendingOnboarding.delete(userId);

        await ctx.reply(
          "Custom personality saved!\n\n" +
            "You're all set. Just send me any message and I'll get to work.\n" +
            "Type /help for all commands.",
        );
        return true;
      }

      return false;
    },

    /** Handle personality selection callback */
    handlePersonalityCallback: async (ctx: Context): Promise<void> => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const data = ctx.callbackQuery?.data;
      if (!data?.startsWith("persona:")) return;

      const key = data.replace("persona:", "");
      const preset = PERSONALITY_PRESETS[key];
      if (!preset) return;

      await ctx.answerCallbackQuery();

      if (key === "custom") {
        pendingOnboarding.set(userId, { step: "custom_soul" });

        await ctx.reply(
          "Type your custom personality description.\n\n" +
            "*Example:*\n" +
            "_You are a friendly Australian developer who uses surfing metaphors. " +
            'You say "no worries" a lot and explain things with beach analogies._\n\n' +
            "Go ahead, describe your ideal AI personality:",
          { parse_mode: "Markdown" },
        );
        return;
      }

      // Save the selected personality
      deps.identityLoader.saveSoul(preset.soul);
      deps.identityLoader.load();
      deps.audit.log(userId, "onboarding:personality", key);
      pendingOnboarding.delete(userId);

      await ctx.reply(
        `Personality set: *${preset.label}*\n` +
          `_${preset.description}_\n\n` +
          "You're all set! Just send me any message and I'll get to work.\n" +
          "Type /help for all commands.\n\n" +
          "_You can change personality anytime with /personality_",
        { parse_mode: "Markdown" },
      );
    },
  };
}
