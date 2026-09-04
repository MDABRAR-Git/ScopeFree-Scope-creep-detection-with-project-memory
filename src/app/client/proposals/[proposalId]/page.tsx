import { ClientAccessPage } from "@/components/client-access-page";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{proposalId:string}>}){return <ClientAccessPage kind="proposals" id={(await params).proposalId}/>;}
