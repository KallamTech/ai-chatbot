import 'server-only';

import { tool, generateText } from 'ai';
import { z } from 'zod';
import { myProvider, ModelId } from '../providers';

// Deep research tool for comprehensive academic and scholarly research
export const deepResearch = () =>
  tool({
    description:
      'Perform comprehensive academic and scholarly research. Use this for in-depth investigation, literature reviews, academic analysis, and thorough research on complex topics. This tool specializes in finding scholarly sources, research papers, academic publications, and authoritative content.',
    inputSchema: z.object({
      query: z
        .string()
        .describe('The research topic or question to investigate deeply'),
      researchType: z
        .enum(['academic', 'literature_review', 'comprehensive', 'scholarly'])
        .optional()
        .default('academic')
        .describe(
          'Type of research - academic for scholarly sources, literature_review for comprehensive literature analysis, comprehensive for thorough investigation, scholarly for authoritative academic content',
        ),
      depth: z
        .enum(['standard', 'comprehensive', 'exhaustive'])
        .optional()
        .default('comprehensive')
        .describe(
          'Research depth - standard for basic academic search, comprehensive for thorough investigation, exhaustive for complete literature coverage',
        ),
      focus: z
        .string()
        .optional()
        .describe(
          'Specific focus area or aspect to emphasize in the research (e.g., "recent developments", "methodology", "applications", "theoretical framework")',
        ),
    }),
    execute: async ({ query, researchType, depth, focus }) => {
      try {
        console.log('DeepResearch: Starting deep research for query:', query);
        console.log('DeepResearch: Research type:', researchType);
        console.log('DeepResearch: Depth:', depth);
        console.log('DeepResearch: Focus:', focus);

        // Create specialized research prompts based on type and depth
        let researchPrompt = '';

        switch (researchType) {
          case 'literature_review':
            researchPrompt = `Conduct a comprehensive literature review on: ${query}.
            ${
              depth === 'exhaustive'
                ? 'Provide an exhaustive analysis covering all major works, seminal papers, and recent developments.'
                : depth === 'comprehensive'
                  ? 'Provide a thorough analysis covering key works, major contributors, and recent developments.'
                  : 'Provide a focused analysis of the most relevant and influential works.'
            }
            ${focus ? `Pay special attention to: ${focus}.` : ''}
            Include: seminal papers, key researchers, theoretical frameworks, methodologies, recent developments, and gaps in current research.`;
            break;

          case 'comprehensive':
            researchPrompt = `Conduct a comprehensive research investigation on: ${query}.
            ${
              depth === 'exhaustive'
                ? 'Provide an exhaustive analysis covering all aspects, perspectives, and developments.'
                : depth === 'comprehensive'
                  ? 'Provide a thorough multi-faceted analysis covering key aspects and perspectives.'
                  : 'Provide a focused analysis of the most important aspects.'
            }
            ${focus ? `With particular emphasis on: ${focus}.` : ''}
            Include: academic sources, research findings, theoretical perspectives, practical applications, current debates, and future directions.`;
            break;

          case 'scholarly':
            researchPrompt = `Conduct scholarly research on: ${query}.
            ${
              depth === 'exhaustive'
                ? 'Provide an exhaustive scholarly analysis with comprehensive coverage of academic literature.'
                : depth === 'comprehensive'
                  ? 'Provide a thorough scholarly analysis with comprehensive academic coverage.'
                  : 'Provide a focused scholarly analysis of key academic sources.'
            }
            ${focus ? `Focusing specifically on: ${focus}.` : ''}
            Emphasize: peer-reviewed sources, academic journals, scholarly books, research methodologies, theoretical frameworks, and academic discourse.`;
            break;

          default: // academic
            researchPrompt = `Conduct academic research on: ${query}.
            ${
              depth === 'exhaustive'
                ? 'Provide an exhaustive academic analysis covering all relevant scholarly sources and perspectives.'
                : depth === 'comprehensive'
                  ? 'Provide a comprehensive academic analysis with thorough scholarly coverage.'
                  : 'Provide a focused academic analysis of key scholarly sources.'
            }
            ${focus ? `With special attention to: ${focus}.` : ''}
            Focus on: academic journals, research papers, scholarly publications, peer-reviewed sources, and authoritative academic content.`;
        }

        // Use Perplexity Sonar for deep research
        const result = await generateText({
          model: myProvider.languageModel(ModelId.DEEPRESEARCH_MODEL),
          prompt: researchPrompt,
        });

        console.log('DeepResearch: Deep research completed successfully');

        // Extract sources from result.steps[0].content where type is sources
        let sources: string[] = [];
        if ((result as any).steps?.[0]?.content) {
          const stepContent = (result as any).steps[0].content;
          if (Array.isArray(stepContent)) {
            sources = stepContent
              .filter((item: any) => item.type === 'sources')
              .map((item: any) => item.source)
              .filter(Boolean);
          } else if (stepContent.type === 'sources') {
            sources = [stepContent.source].filter(Boolean);
          }
        }

        return {
          query,
          researchType,
          depth,
          focus: focus || null,
          results: result.text,
          sources,
          timestamp: new Date().toISOString(),
          methodology: {
            searchStrategy: 'academic-focused',
            depthLevel: depth,
            researchType: researchType,
            focusArea: focus || 'general',
          },
        };
      } catch (error) {
        console.error('DeepResearch: Error during deep research:', error);

        return {
          query,
          researchType,
          depth,
          focus: focus || null,
          error: 'Failed to perform deep research',
          details: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          source: 'perplexity-sonar-deep-research',
        };
      }
    },
  });
