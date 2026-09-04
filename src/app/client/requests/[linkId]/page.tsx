import { ClientAccessPage } from "@/components/client-access-page";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{linkId:string}>}){return <ClientAccessPage kind="requests" id={(await params).linkId}/>;}
