import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TestStorico } from "@/components/TestStorico";

export const Route=createFileRoute("/test-storici")({
  head:()=>({meta:[{title:"Simulatore storico multi-asset — Althea"},{name:"description",content:"Portafoglio simulato Althea con capitale condiviso, strategie e comitato IA, costi, rischio e checkpoint; nessun ordine operativo."},{property:"og:title",content:"Simulatore storico di portafoglio — Althea"},{property:"og:description",content:"Confronta strategie e comitato su portafogli storici multi-asset con capitale condiviso, metriche nette e budget IA."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component:()=> <main className="mx-auto max-w-6xl px-5 py-8"><Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft className="size-4"/>Dashboard</Link><TestStorico/></main>,
});