import { notFound } from "next/navigation";
import { requirePageSession } from "@/server/auth";
import { getEstimate } from "@/server/analysis";
import { AppError } from "@/server/errors";
import { AnalysisResults } from "@/components/analysis-results";
export default async function EstimatePage({ params }: { params: Promise<{ projectId: string; estimateId: string }> }) {
  await requirePageSession(); const { projectId, estimateId } = await params;
  const estimate = await getEstimate(estimateId).catch(e => { if (e instanceof AppError && e.status === 404) notFound(); throw e; });
  if (estimate.projectId !== projectId) notFound();
  return <AnalysisResults estimate={estimate} />;
}
