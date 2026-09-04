import { Layers2 } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) { return <span className={`brand ${light ? "brand-light" : ""}`}><span className="brand-icon"><Layers2 size={23} strokeWidth={1.8} aria-hidden="true" /></span>ScopeFree<span className="brand-dot">.</span></span>; }
