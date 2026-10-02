import type { StrategyId } from "./strategies";

export type SettimanaStrategia = {
  settimana: string; // lunedì AAAA-MM-GG
  conservativo: number;
  medio: number;
  aggressivo: number;
};

export type RiepilogoStrategia = {
  strategia: StrategyId;
  ordini: number;
  acquisti: number;
  vendite: number;
  vincite: number;
  perdite: number;
  capitaleInvestito: number;
};

export type StatisticheStrategie = {
  riepilogo: RiepilogoStrategia[];
  settimane: SettimanaStrategia[];
  ultimi: {
    id: string;
    strategia: string;
    ticker: string;
    lato: string;
    importo: number;
    pnlPct: number | null;
    motivo: string | null;
    createdAt: string;
  }[];
};

export type PosizioneSimulata = {
  ticker: string;
  costo: number;
  valoreReale: number;
  pnlReale: number;
  valoreIpotetico: number;
  pnlIpotetico: number;
  dividendi: number;
  costi: number;
};

export type EsitoSimulazione = {
  ok: boolean;
  messaggio?: string;
  giorni: number;
  posizioni: PosizioneSimulata[];
  serie: { data: string; ipotetico: number; investito: number }[];
  totale: {
    costo: number;
    valoreReale: number;
    pnlReale: number;
    valoreIpotetico: number;
    pnlIpotetico: number;
    dividendi: number;
    costi: number;
  };
};
