-- Add 'websearch', 'news', and 'deepresearch' to WorkflowNode nodeType enum
ALTER TABLE "WorkflowNode" DROP CONSTRAINT IF EXISTS "WorkflowNode_nodeType_check";
ALTER TABLE "WorkflowNode" ADD CONSTRAINT "WorkflowNode_nodeType_check" CHECK ("nodeType" IN ('rag', 'transform', 'filter', 'aggregate', 'runtime', 'websearch', 'news', 'deepresearch'));
