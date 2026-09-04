import { notFound } from "next/navigation";
import { MemoryDecisionView } from "@/components/memory-decision";
import { getMemoryDecision } from "@/server/memory";
import { AppError } from "@/server/errors";

export default async function MemoryDecisionPage({ params }: { params: Promise<{ projectId: string; decisionId: string }> }) {
  const { projectId, decisionId } = await params;
  const decision = await getMemoryDecision(projectId, decisionId).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  return <MemoryDecisionView projectId={projectId} decision={decision} />;
}
