CREATE TABLE IF NOT EXISTS "AgentDataPool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agentId" uuid NOT NULL,
	"dataPoolId" uuid NOT NULL,
	"createdAt" timestamp NOT NULL,
	CONSTRAINT "AgentDataPool_agentId_dataPoolId_unique" UNIQUE("agentId","dataPoolId")
);
--> statement-breakpoint
ALTER TABLE "DataPool" DROP CONSTRAINT "DataPool_agentId_Agent_id_fk";
--> statement-breakpoint
ALTER TABLE "DataPool" ADD COLUMN "userId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "DataPool" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "DataPool" ADD COLUMN "updatedAt" timestamp NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentDataPool" ADD CONSTRAINT "AgentDataPool_agentId_Agent_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."Agent"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentDataPool" ADD CONSTRAINT "AgentDataPool_dataPoolId_DataPool_id_fk" FOREIGN KEY ("dataPoolId") REFERENCES "public"."DataPool"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DataPool" ADD CONSTRAINT "DataPool_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "DataPool" DROP COLUMN IF EXISTS "agentId";