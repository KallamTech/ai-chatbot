import 'server-only';

import { tool, generateText } from 'ai';
import { z } from 'zod';
import { myProvider, ModelId } from '../providers';

// Web search tool using Perplexity Sonar
export const webSearch = () =>
  tool({
    description:
      'Search the web for current information, news, facts, or any real-time data. Use this when you need up-to-date information that may not be in your training data.',
    inputSchema: z.object({
      query: z.string().describe('The search query to find information on the web'),
      type: z
        .enum(['general', 'news', 'academic', 'recent'])
        .optional()
        .default('general')
        .describe('Type of search - general for broad topics, news for current events, academic for research, recent for latest updates'),
    }),
    execute: async ({ query, type }) => {
      try {
        console.log('WebSearch: Starting web search for query:', query);
        console.log('WebSearch: Search type:', type);

        // Create a search prompt based on the type
        let searchPrompt = '';
        switch (type) {
          case 'news':
            searchPrompt = `Find the latest news and current events about: ${query}. Focus on recent developments, breaking news, and current happenings.`;
            break;
          case 'academic':
            searchPrompt = `Find academic and research information about: ${query}. Focus on scholarly sources, research papers, and authoritative academic content.`;
            break;
          case 'recent':
            searchPrompt = `Find the most recent and up-to-date information about: ${query}. Focus on the latest developments, updates, and current status.`;
            break;
          default:
            searchPrompt = `Search for comprehensive information about: ${query}. Provide factual, relevant, and current information.`;
        }

        // Use Perplexity Sonar for web search
        const result = await generateText({
          model: myProvider.languageModel(ModelId.WEBSEARCH_MODEL),
          prompt: searchPrompt,
        });

        console.log('WebSearch: Search completed successfully');

        return {
          query,
          type,
          results: result.text,
          timestamp: new Date().toISOString(),
          source: 'perplexity-sonar'
        };

      } catch (error) {
        console.error('WebSearch: Error during web search:', error);

        return {
          query,
          type,
          error: 'Failed to perform web search',
          details: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          source: 'perplexity-sonar'
        };
      }
    },
  });

// Alternative web search tool specifically for news
export const newsSearch = () =>
  tool({
    description:
      'Search for the latest news and current events. Use this for breaking news, recent developments, and current affairs.',
    inputSchema: z.object({
      query: z.string().describe('The news topic or event to search for'),
      timeframe: z
        .enum(['today', 'week', 'month'])
        .optional()
        .default('week')
        .describe('Timeframe for news search'),
    }),
    execute: async ({ query, timeframe }) => {
      try {
        console.log('NewsSearch: Starting news search for query:', query);
        console.log('NewsSearch: Timeframe:', timeframe);

        const timePrompt = {
          today: 'from today',
          week: 'from the past week',
          month: 'from the past month'
        }[timeframe];

        const searchPrompt = `Find the latest news and breaking stories about: ${query}. Focus on news ${timePrompt}. Provide current, factual news reporting with sources when possible.`;

        const result = await generateText({
          model: myProvider.languageModel(ModelId.WEBSEARCH_MODEL),
          prompt: searchPrompt,
        });

        console.log('NewsSearch: News search completed successfully');

        return {
          query,
          timeframe,
          results: result.text,
          timestamp: new Date().toISOString(),
          source: 'perplexity-sonar',
          type: 'news'
        };

      } catch (error) {
        console.error('NewsSearch: Error during news search:', error);

        return {
          query,
          timeframe,
          error: 'Failed to perform news search',
          details: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          source: 'perplexity-sonar',
          type: 'news'
        };
      }
    },
  });
