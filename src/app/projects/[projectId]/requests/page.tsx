import { RequestHistoryView } from "@/components/request-history";
import { getRequestHistory } from "@/server/request-history";
import { RequestIntake } from "@/components/request-intake";
import { requirePageSession } from "@/server/auth";
import { getBaseline, listRequests } from "@/server/intake";
export default async function RequestsPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requirePageSession();
  const { projectId } = await params;
  const [baseline, requests, history] = await Promise.all([getBaseline(projectId), listRequests(projectId), getRequestHistory(projectId)]);
  return <><RequestIntake key={projectId} projectId={projectId} hasBaseline={!!baseline} initialRequests={requests} /><RequestHistoryView history={history} projectId={projectId} /></>;
}
