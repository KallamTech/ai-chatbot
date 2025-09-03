import { motion } from 'framer-motion';

export const Greeting = () => {
  return (
    <div
      key="overview"
      className="max-w-4xl mx-auto md:mt-20 px-8 size-full flex flex-col justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
        className="text-3xl font-semibold mb-2"
      >
        Welcome to AI Chatbot Platform
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
        className="text-lg text-zinc-500 mb-8"
      >
        Your intelligent assistant powered by cutting-edge AI models
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ delay: 0.7 }}
        className="grid md:grid-cols-2 gap-6 mb-8"
      >
        {/* AI Models & Capabilities */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl p-6 border border-blue-200/50 dark:border-blue-800/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">AI Models</h3>
          </div>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
            Logged-in users have access to 25+ state-of-the-art AI models including GPT-4, Claude, Gemini, DeepSeek, and Grok with advanced reasoning capabilities.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">25+ Models</span>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">GPT-4 & GPT-5</span>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">Claude Sonnet</span>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">Gemini 2.5</span>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">DeepSeek V3</span>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">Grok 4</span>
          </div>
        </div>

        {/* Smart Agents */}
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-xl p-6 border border-purple-200/50 dark:border-purple-800/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">Smart Agents</h3>
          </div>
          <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
            Create specialized AI agents with custom workflows. Web search powered by Perplexity models, coding optimized with Grok models.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">Perplexity Web Search</span>
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">Grok Coding</span>
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">Python Runtime</span>
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">Data Analysis</span>
          </div>
        </div>

        {/* Data Pools */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-xl p-6 border border-green-200/50 dark:border-green-800/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Data Pools</h3>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
            Organize and share documents across multiple agents. Powered by Cohere V4 embeddings with vision capabilities and Mistral OCR for advanced document processing.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">Cohere V4 Embeddings</span>
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">Mistral OCR</span>
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">Vision Capabilities</span>
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">Semantic Search</span>
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded-full">Multi-Agent Sharing</span>
          </div>
        </div>

        {/* Artifacts & Tools */}
        <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 rounded-xl p-6 border border-orange-200/50 dark:border-orange-800/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">Artifacts & Tools</h3>
          </div>
          <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
            Create and edit documents, code, images, and spreadsheets. Image generation powered by Gemini Image Preview (Nano-Banana) model.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">Gemini Image Gen</span>
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">Code Editor</span>
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">Text Editor</span>
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full">Spreadsheets</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ delay: 0.8 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Ready to get started? Ask me anything!
        </div>
      </motion.div>
    </div>
  );
};
