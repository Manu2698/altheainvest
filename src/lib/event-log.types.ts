export type LivelloEvento = "error" | "warn" | "info";

export type EventoDaRegistrare = {
  livello?: LivelloEvento;
  origine: string;
  tipo?: string;
  messaggio: string;
  stack?: string | undefined;
  contesto?: Record<string, unknown> | undefined;
  ambiente?: string | undefined;
  url?: string | undefined;
  userAgent?: string | undefined;
};

export type EventoRegistrato = {
  id: string;
  createdAt: string;
  livello: string;
  origine: string;
  tipo: string;
  messaggio: string;
  stack: string | null;
  contesto: Record<string, unknown> | null;
  ambiente: string | null;
  url: string | null;
};
