import { motion } from 'framer-motion';
import type { Session } from 'next-auth';
import Link from 'next/link';

interface GreetingProps {
  session: Session;
}

export const Greeting = ({ session }: GreetingProps) => {
  // Hide the message if user is signed in (not a guest)
  const isGuest = session?.user?.type === 'guest';
  return (
    <div
      key="overview"
      className="max-w-4xl mx-auto md:mt-6 px-4 size-full flex flex-col justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
        className="text-xl font-semibold mb-1"
      >
        One Platform, Limitless Intelligence
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
        className="text-sm text-zinc-500 mb-4"
      >
        Go beyond chat. Harness the power of best-in-class AI to build powerful
        custom agents in simple, natural language
      </motion.div>

      {isGuest && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ delay: 0.65 }}
          className="text-center mb-6"
        >
          <Link
            href="/register"
            className="text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 border-0 rounded-lg px-6 py-3 inline-block shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 cursor-pointer"
          >
            Sign up for free & start building your first agent
          </Link>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ delay: 0.7 }}
        className="grid md:grid-cols-2 gap-3 mb-4"
      >
        {/* AI Models & Capabilities */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-md p-3 border border-blue-200/50 dark:border-blue-800/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-blue-500 rounded-sm flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              The AI Toolkit
            </h3>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 mb-1.5">
            Equip your agents with over 25+ models. This collection is built to
            collaborate on advanced reasoning and execute diverse tasks
          </p>
          <div className="flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              GPT
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Claude
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Gemini
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              DeepSeek
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Grok
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Mistral
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Perplexity
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Llama
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Qwen
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Kimi
            </span>
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
              Cohere
            </span>
          </div>
        </div>

        {/* Smart Agents */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-md p-3 border border-purple-200/50 dark:border-purple-800/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-purple-500 rounded-sm flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100">
              Your Agents
            </h3>
          </div>
          <p className="text-xs text-purple-700 dark:text-purple-300 mb-1.5">
            Create agents that can search the web, write code, analyze data, and
            execute complex workflows runtime.
          </p>
          <div className="flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">
              Web Search
            </span>
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">
              Data Analysis
            </span>
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">
              Code Generation
            </span>
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">
              Workflow Automation
            </span>
          </div>
        </div>

        {/* Data Pools */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-md p-3 border border-green-200/50 dark:border-green-800/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-green-500 rounded-sm flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
              Connect Your Data
            </h3>
          </div>
          <p className="text-xs text-green-700 dark:text-green-300 mb-1.5">
            Ground your agents in your knowledge. Upload documents, connect data
            sources, and enable vision or OCR
          </p>
          <div className="flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">
              Document Upload
            </span>
            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">
              Web Data
            </span>
            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">
              Vision & OCR
            </span>
            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">
              Hybrid Search
            </span>
          </div>
        </div>

        {/* Artifacts & Tools */}
        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 rounded-md p-3 border border-orange-200/50 dark:border-orange-800/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-orange-500 rounded-sm flex items-center justify-center">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100">
              Workspace & Tools
            </h3>
          </div>
          <p className="text-xs text-orange-700 dark:text-orange-300 mb-1.5">
            Generate and edit documents, code, images, and data sheets. All the
            output from your agents lives here
          </p>
          <div className="flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">
              Image Generation
            </span>
            <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">
              Code Editor
            </span>
            <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">
              Doc Editor
            </span>
            <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">
              Spreadsheets
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
