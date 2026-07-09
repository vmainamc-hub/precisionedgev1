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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auto_trade_settings: {
        Row: {
          created_at: string
          demo_only: boolean
          duration_ticks: number
          enabled: boolean
          max_consecutive_losses: number
          max_daily_loss: number | null
          min_confidence: number
          sources: Json
          stake: number
          stop_loss: number | null
          take_profit: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          demo_only?: boolean
          duration_ticks?: number
          enabled?: boolean
          max_consecutive_losses?: number
          max_daily_loss?: number | null
          min_confidence?: number
          sources?: Json
          stake?: number
          stop_loss?: number | null
          take_profit?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          demo_only?: boolean
          duration_ticks?: number
          enabled?: boolean
          max_consecutive_losses?: number
          max_daily_loss?: number | null
          min_confidence?: number
          sources?: Json
          stake?: number
          stop_loss?: number | null
          take_profit?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deriv_accounts: {
        Row: {
          balance: number | null
          created_at: string
          currency: string | null
          id: string
          is_active: boolean
          is_virtual: boolean
          loginid: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_virtual?: boolean
          loginid: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          is_virtual?: boolean
          loginid?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deriv_connected: boolean
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deriv_connected?: boolean
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deriv_connected?: boolean
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      signals_log: {
        Row: {
          confidence: number | null
          created_at: string
          direction: string
          id: string
          market_type: string
          reasons: Json | null
          symbol: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          direction: string
          id?: string
          market_type: string
          reasons?: Json | null
          symbol: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          direction?: string
          id?: string
          market_type?: string
          reasons?: Json | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          auto_trade: boolean
          barrier: string | null
          closed_at: string | null
          contract_id: string | null
          contract_type: string
          created_at: string
          deriv_account_id: string | null
          duration: number | null
          duration_unit: string | null
          entry_price: number | null
          exit_price: number | null
          id: string
          is_virtual: boolean
          loginid: string | null
          meta: Json | null
          payout: number | null
          profit: number | null
          purchased_at: string | null
          signal_source: string | null
          stake: number
          status: string
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_trade?: boolean
          barrier?: string | null
          closed_at?: string | null
          contract_id?: string | null
          contract_type: string
          created_at?: string
          deriv_account_id?: string | null
          duration?: number | null
          duration_unit?: string | null
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          is_virtual?: boolean
          loginid?: string | null
          meta?: Json | null
          payout?: number | null
          profit?: number | null
          purchased_at?: string | null
          signal_source?: string | null
          stake: number
          status?: string
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_trade?: boolean
          barrier?: string | null
          closed_at?: string | null
          contract_id?: string | null
          contract_type?: string
          created_at?: string
          deriv_account_id?: string | null
          duration?: number | null
          duration_unit?: string | null
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          is_virtual?: boolean
          loginid?: string | null
          meta?: Json | null
          payout?: number | null
          profit?: number | null
          purchased_at?: string | null
          signal_source?: string | null
          stake?: number
          status?: string
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_deriv_account_id_fkey"
            columns: ["deriv_account_id"]
            isOneToOne: false
            referencedRelation: "deriv_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          alert_sound: boolean
          default_symbol: string | null
          max_daily_loss: number | null
          max_stake: number | null
          min_confidence: number
          risk_profile: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_sound?: boolean
          default_symbol?: string | null
          max_daily_loss?: number | null
          max_stake?: number | null
          min_confidence?: number
          risk_profile?: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_sound?: boolean
          default_symbol?: string | null
          max_daily_loss?: number | null
          max_stake?: number | null
          min_confidence?: number
          risk_profile?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
