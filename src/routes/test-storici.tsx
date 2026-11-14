import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TestStorico } from "@/components/TestStorico";
import { BacktestAutonomo } from "@/components/BacktestAutonomo";

export const Route=createFileRoute("/test-storici")({
  head:()=>({meta:[{title:"Backtest autonomo e multi-asset — Althea"},{name:"description",content:"Prototipo rules-only con 50 EUR, fonti storiche, cambi e portafoglio condiviso; simulazioni isolate senza ordini operativi."},{property:"og:title",content:"Backtest autonomo rules-only — Althea"},{property:"og:description",content:"Simulazioni multi-asset con copertura dichiarata, capitale condiviso, costi e confronto strategie; prototipo autonomo a budget IA zero."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component:()=> <main className="mx-auto max-w-6xl px-5 py-8"><Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft className="size-4"/>Dashboard</Link><BacktestAutonomo/><TestStorico/></main>,
});