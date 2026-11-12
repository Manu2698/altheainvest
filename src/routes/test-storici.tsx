import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TestStorico } from "@/components/TestStorico";

export const Route=createFileRoute("/test-storici")({
  head:()=>({meta:[{title:"Test storici delle strategie e del comitato IA — Althea"},{name:"description",content:"Simulazioni storiche Althea su periodi scelti, con costi, trade vincenti, profit factor e drawdown; nessun ordine operativo."},{property:"og:title",content:"Test storici dell’IA — Althea"},{property:"og:description",content:"Confronta strategie e comitato su dati storici, con metriche nette, argomentazioni e limiti dichiarati."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component:()=> <main className="mx-auto max-w-6xl px-5 py-8"><Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft className="size-4"/>Dashboard</Link><TestStorico/></main>,
});