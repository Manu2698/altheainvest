export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      analisi_comitato: {
        Row: {
          agenti: Json
          ambiente: string
          conto_id: string | null
          created_at: string
          dati: Json
          decisione: string
          dibattito: Json
          errore: string | null
          esito_dibattito: string | null
          id: string
          motivo: string
          proposta: string
          strategia: string
          ticker: string
          user_id: string
          veto: boolean
        }
        Insert: {
          agenti?: Json
          ambiente: string
          conto_id?: string | null
          created_at?: string
          dati?: Json
          decisione: string
          dibattito?: Json
          errore?: string | null
          esito_dibattito?: string | null
          id?: string
          motivo: string
          proposta: string
          strategia: string
          ticker: string
          user_id: string
          veto?: boolean
        }
        Update: {
          agenti?: Json
          ambiente?: string
          conto_id?: string | null
          created_at?: string
          dati?: Json
          decisione?: string
          dibattito?: Json
          errore?: string | null
          esito_dibattito?: string | null
          id?: string
          motivo?: string
          proposta?: string
          strategia?: string
          ticker?: string
          user_id?: string
          veto?: boolean
        }
        Relationships: []
      }
      automazioni_conti: {
        Row: {
          acquisto_limite: number | null
          ambiente: string
          attivo: boolean
          bloccato_fino: string | null
          capitale: number
          created_at: string
          limiti_conto_id: string | null
          liquidita_limite: number | null
          modalita: string
          pausa_il: string | null
          pausa_motivo: string | null
          perdita_max_giornaliera: number | null
          piattaforma: string
          strategia: string
          ultimo_ciclo: string | null
          ultimo_esito: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acquisto_limite?: number | null
          ambiente?: string
          attivo?: boolean
          bloccato_fino?: string | null
          capitale?: number
          created_at?: string
          limiti_conto_id?: string | null
          liquidita_limite?: number | null
          modalita?: string
          pausa_il?: string | null
          pausa_motivo?: string | null
          perdita_max_giornaliera?: number | null
          piattaforma?: string
          strategia?: string
          ultimo_ciclo?: string | null
          ultimo_esito?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acquisto_limite?: number | null
          ambiente?: string
          attivo?: boolean
          bloccato_fino?: string | null
          capitale?: number
          created_at?: string
          limiti_conto_id?: string | null
          liquidita_limite?: number | null
          modalita?: string
          pausa_il?: string | null
          pausa_motivo?: string | null
          perdita_max_giornaliera?: number | null
          piattaforma?: string
          strategia?: string
          ultimo_ciclo?: string | null
          ultimo_esito?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      automazioni_ia: {
        Row: {
          attivo: boolean
          bloccato_fino: string | null
          capitale: number
          modalita: string
          pausa_il: string | null
          pausa_motivo: string | null
          perdita_max_giornaliera: number | null
          piattaforma: string
          reale: boolean
          strategia: string
          ultimo_ciclo: string | null
          ultimo_esito: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attivo?: boolean
          bloccato_fino?: string | null
          capitale?: number
          modalita?: string
          pausa_il?: string | null
          pausa_motivo?: string | null
          perdita_max_giornaliera?: number | null
          piattaforma?: string
          reale?: boolean
          strategia?: string
          ultimo_ciclo?: string | null
          ultimo_esito?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attivo?: boolean
          bloccato_fino?: string | null
          capitale?: number
          modalita?: string
          pausa_il?: string | null
          pausa_motivo?: string | null
          perdita_max_giornaliera?: number | null
          piattaforma?: string
          reale?: boolean
          strategia?: string
          ultimo_ciclo?: string | null
          ultimo_esito?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_credenziali: {
        Row: {
          ambiente: string
          api_secret: string
          created_at: string
          id: string
          key_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ambiente: string
          api_secret: string
          created_at?: string
          id?: string
          key_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ambiente?: string
          api_secret?: string
          created_at?: string
          id?: string
          key_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messaggi: {
        Row: {
          created_at: string
          id: string
          messaggio: Json
          ruolo: string
          sdk_id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messaggio: Json
          ruolo: string
          sdk_id: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messaggio?: Json
          ruolo?: string
          sdk_id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messaggi_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_thread"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_thread: {
        Row: {
          created_at: string
          id: string
          titolo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          titolo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          titolo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conti_broker: {
        Row: {
          ambiente: string
          archiviato_il: string | null
          collegato_il: string
          conto_id: string
          etichetta: string | null
          id: string
          motivo: string | null
          piattaforma: string
          riconciliato_il: string | null
          stato: string
          ultimo_visto: string
          user_id: string
          verificato: boolean
        }
        Insert: {
          ambiente: string
          archiviato_il?: string | null
          collegato_il?: string
          conto_id: string
          etichetta?: string | null
          id?: string
          motivo?: string | null
          piattaforma: string
          riconciliato_il?: string | null
          stato?: string
          ultimo_visto?: string
          user_id: string
          verificato?: boolean
        }
        Update: {
          ambiente?: string
          archiviato_il?: string | null
          collegato_il?: string
          conto_id?: string
          etichetta?: string | null
          id?: string
          motivo?: string | null
          piattaforma?: string
          riconciliato_il?: string | null
          stato?: string
          ultimo_visto?: string
          user_id?: string
          verificato?: boolean
        }
        Relationships: []
      }
      esecuzioni_broker: {
        Row: {
          ambiente: string
          broker_fill_id: string
          broker_order_id: string
          conto_id: string
          eseguito_il: string
          id: string
          lato: string
          piattaforma: string
          prezzo: number
          quantita: number
          ticker: string
          user_id: string
        }
        Insert: {
          ambiente: string
          broker_fill_id: string
          broker_order_id: string
          conto_id: string
          eseguito_il: string
          id?: string
          lato: string
          piattaforma: string
          prezzo: number
          quantita: number
          ticker: string
          user_id: string
        }
        Update: {
          ambiente?: string
          broker_fill_id?: string
          broker_order_id?: string
          conto_id?: string
          eseguito_il?: string
          id?: string
          lato?: string
          piattaforma?: string
          prezzo?: number
          quantita?: number
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      event_log: {
        Row: {
          ambiente: string | null
          contesto: Json | null
          created_at: string
          id: string
          livello: string
          messaggio: string
          origine: string
          stack: string | null
          tipo: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          ambiente?: string | null
          contesto?: Json | null
          created_at?: string
          id?: string
          livello?: string
          messaggio: string
          origine: string
          stack?: string | null
          tipo?: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          ambiente?: string | null
          contesto?: Json | null
          created_at?: string
          id?: string
          livello?: string
          messaggio?: string
          origine?: string
          stack?: string | null
          tipo?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      istantanee_contabili: {
        Row: {
          ambiente: string
          contabilita: Json
          conto_id: string
          created_at: string
          equity: number | null
          flussi: Json
          id: string
          liquidita: number | null
          motivo: string
          osservato_al: string
          osservato_dal: string
          piattaforma: string
          posizioni: Json
          potere_acquisto: number | null
          scarto: number | null
          stato: string
          storico: Json
          user_id: string
          valuta: string
        }
        Insert: {
          ambiente: string
          contabilita?: Json
          conto_id: string
          created_at?: string
          equity?: number | null
          flussi?: Json
          id?: string
          liquidita?: number | null
          motivo: string
          osservato_al: string
          osservato_dal: string
          piattaforma: string
          posizioni?: Json
          potere_acquisto?: number | null
          scarto?: number | null
          stato: string
          storico?: Json
          user_id: string
          valuta: string
        }
        Update: {
          ambiente?: string
          contabilita?: Json
          conto_id?: string
          created_at?: string
          equity?: number | null
          flussi?: Json
          id?: string
          liquidita?: number | null
          motivo?: string
          osservato_al?: string
          osservato_dal?: string
          piattaforma?: string
          posizioni?: Json
          potere_acquisto?: number | null
          scarto?: number | null
          stato?: string
          storico?: Json
          user_id?: string
          valuta?: string
        }
        Relationships: []
      }
      lease_conti: {
        Row: {
          ambiente: string
          piattaforma: string
          proprietario: string
          scade_il: string
          user_id: string
        }
        Insert: {
          ambiente: string
          piattaforma: string
          proprietario: string
          scade_il: string
          user_id: string
        }
        Update: {
          ambiente?: string
          piattaforma?: string
          proprietario?: string
          scade_il?: string
          user_id?: string
        }
        Relationships: []
      }
      link_condivisione: {
        Row: {
          accessi: number
          accessi_finestra: number
          creato_il: string
          finestra_inizio: string | null
          id: string
          nome: string
          opzioni: Json
          revocato_il: string | null
          scade_il: string
          token_hash: string
          ultimo_accesso: string | null
          user_id: string
        }
        Insert: {
          accessi?: number
          accessi_finestra?: number
          creato_il?: string
          finestra_inizio?: string | null
          id?: string
          nome: string
          opzioni?: Json
          revocato_il?: string | null
          scade_il: string
          token_hash: string
          ultimo_accesso?: string | null
          user_id: string
        }
        Update: {
          accessi?: number
          accessi_finestra?: number
          creato_il?: string
          finestra_inizio?: string | null
          id?: string
          nome?: string
          opzioni?: Json
          revocato_il?: string | null
          scade_il?: string
          token_hash?: string
          ultimo_accesso?: string | null
          user_id?: string
        }
        Relationships: []
      }
      movimenti: {
        Row: {
          ambiente: string
          created_at: string
          id: string
          importo: number
          metodo: string
          note: string | null
          riferimento: string | null
          stato: string
          tipo: string
          user_id: string
          valuta: string
        }
        Insert: {
          ambiente?: string
          created_at?: string
          id?: string
          importo: number
          metodo?: string
          note?: string | null
          riferimento?: string | null
          stato?: string
          tipo: string
          user_id: string
          valuta?: string
        }
        Update: {
          ambiente?: string
          created_at?: string
          id?: string
          importo?: number
          metodo?: string
          note?: string | null
          riferimento?: string | null
          stato?: string
          tipo?: string
          user_id?: string
          valuta?: string
        }
        Relationships: []
      }
      ordini_ia: {
        Row: {
          ambiente: string
          conto_attribuzione: string | null
          conto_id: string | null
          created_at: string
          id: string
          importo: number
          lato: string
          motivo: string | null
          piattaforma: string
          pnl_pct: number | null
          strategia: string
          ticker: string
          user_id: string
        }
        Insert: {
          ambiente?: string
          conto_attribuzione?: string | null
          conto_id?: string | null
          created_at?: string
          id?: string
          importo?: number
          lato: string
          motivo?: string | null
          piattaforma?: string
          pnl_pct?: number | null
          strategia: string
          ticker: string
          user_id: string
        }
        Update: {
          ambiente?: string
          conto_attribuzione?: string | null
          conto_id?: string | null
          created_at?: string
          id?: string
          importo?: number
          lato?: string
          motivo?: string | null
          piattaforma?: string
          pnl_pct?: number | null
          strategia?: string
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      ordini_pianificati: {
        Row: {
          created_at: string
          errore: string | null
          esegui_il: string
          eseguito_il: string | null
          id: string
          importo: number
          lato: string
          ordine_id: string | null
          quantita: number | null
          reale: boolean
          stato: string
          ticker: string
          user_id: string
        }
        Insert: {
          created_at?: string
          errore?: string | null
          esegui_il: string
          eseguito_il?: string | null
          id?: string
          importo: number
          lato?: string
          ordine_id?: string | null
          quantita?: number | null
          reale?: boolean
          stato?: string
          ticker: string
          user_id: string
        }
        Update: {
          created_at?: string
          errore?: string | null
          esegui_il?: string
          eseguito_il?: string | null
          id?: string
          importo?: number
          lato?: string
          ordine_id?: string | null
          quantita?: number | null
          reale?: boolean
          stato?: string
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      piattaforme_credenziali: {
        Row: {
          ambiente: string
          api_secret: string
          key_id: string
          piattaforma: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ambiente: string
          api_secret: string
          key_id: string
          piattaforma: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ambiente?: string
          api_secret?: string
          key_id?: string
          piattaforma?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profili: {
        Row: {
          created_at: string
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      registro_ordini: {
        Row: {
          ambiente: string
          annullato_il: string | null
          broker_aggiornato_il: string | null
          broker_creato_il: string | null
          broker_id: string | null
          client_id: string
          conto_id: string
          created_at: string
          eseguito_il: string | null
          id: string
          importo_richiesto: number | null
          lato: string
          piattaforma: string
          prezzo_medio: number | null
          quantita_eseguita: number
          riconciliato_il: string | null
          riconciliazione_motivo: string | null
          stato: string
          strategia: string
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ambiente: string
          annullato_il?: string | null
          broker_aggiornato_il?: string | null
          broker_creato_il?: string | null
          broker_id?: string | null
          client_id: string
          conto_id: string
          created_at?: string
          eseguito_il?: string | null
          id?: string
          importo_richiesto?: number | null
          lato: string
          piattaforma: string
          prezzo_medio?: number | null
          quantita_eseguita?: number
          riconciliato_il?: string | null
          riconciliazione_motivo?: string | null
          stato?: string
          strategia: string
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ambiente?: string
          annullato_il?: string | null
          broker_aggiornato_il?: string | null
          broker_creato_il?: string | null
          broker_id?: string | null
          client_id?: string
          conto_id?: string
          created_at?: string
          eseguito_il?: string | null
          id?: string
          importo_richiesto?: number | null
          lato?: string
          piattaforma?: string
          prezzo_medio?: number | null
          quantita_eseguita?: number
          riconciliato_il?: string | null
          riconciliazione_motivo?: string | null
          stato?: string
          strategia?: string
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      prendi_lease_conto: {
        Args: {
          p_ambiente: string
          p_piattaforma: string
          p_proprietario: string
          p_user: string
        }
        Returns: boolean
      }
      prepara_intento_ordine: {
        Args: {
          p_ambiente: string
          p_client: string
          p_conto: string
          p_importo: number
          p_lato: string
          p_piattaforma: string
          p_proprietario: string
          p_strategia: string
          p_ticker: string
          p_user: string
        }
        Returns: string
      }
      registra_accesso_condivisione: {
        Args: { p_finestra_secondi: number; p_id: string; p_massimo: number }
        Returns: boolean
      }
      verifica_lease_conto: {
        Args: {
          p_ambiente: string
          p_piattaforma: string
          p_proprietario: string
          p_user: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
