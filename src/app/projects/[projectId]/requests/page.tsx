import { RequestHistoryView } from "@/components/request-history";
import { getRequestHistory } from "@/server/request-history";
import { RequestIntake } from "@/components/request-intake";
import { requirePageSession } from "@/server/auth";
import { getBaseline, listRequests } from "@/server/intake";
import { getIntakeLink } from "@/server/client-intake";
import { ClientIntakeLink } from "@/components/client-intake-link";
export default async function RequestsPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requirePageSession();
  const { projectId } = await params;
  const [baseline, requests, history] = await Promise.all([getBaseline(projectId), listRequests(projectId), getRequestHistory(projectId)]);
  const intake = baseline ? await getIntakeLink(projectId) : null;
  return <><RequestIntake key={projectId} projectId={projectId} hasBaseline={!!baseline} initialRequests={requests} />{baseline && <ClientIntakeLink projectId={projectId} initial={intake}/>}<RequestHistoryView history={history} projectId={projectId} /></>;
}
