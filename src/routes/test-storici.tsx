import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { TestStorico } from "@/components/TestStorico";
import { BacktestAutonomo } from "@/components/BacktestAutonomo";

export const Route=createFileRoute("/test-storici")({
  head:()=>({meta:[{title:"Backtest autonomo e multi-asset — Althea"},{name:"description",content:"Universo Alpaca acquisito automaticamente, copertura storica dichiarata e portafoglio simulato da 50 EUR. Screening IA non certificato."},{property:"og:title",content:"Backtest storico autonomo — Althea"},{property:"og:description",content:"Acquisizione per blocchi, checkpoint e verifica delle evidenze: stato completo o incompleto esplicito, nessun ordine operativo."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component:()=> <main className="mx-auto max-w-6xl px-5 py-8"><Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft className="size-4"/>Dashboard</Link><BacktestAutonomo/><TestStorico/></main>,
});