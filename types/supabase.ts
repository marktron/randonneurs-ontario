export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admins: {
        Row: {
          chapter_id: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string | null
          email: string
          id: string
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'admins_chapter_id_fkey'
            columns: ['chapter_id']
            isOneToOne: false
            referencedRelation: 'chapters'
            referencedColumns: ['id']
          },
        ]
      }
      awards: {
        Row: {
          award_type: string | null
          created_at: string | null
          description: string | null
          id: string
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          award_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          award_type?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chapters: {
        Row: {
          created_at: string | null
          description: string | null
          founded_year: number | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          founded_year?: number | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          founded_year?: number | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          chapter_id: string
          collection: string | null
          created_at: string | null
          description: string | null
          distance_km: number
          event_date: string
          event_type: string
          external_register_url: string | null
          id: string
          image_url: string | null
          name: string
          registration_closes_at: string | null
          registration_opens_at: string | null
          route_id: string | null
          season: number | null
          slug: string
          start_location: string | null
          start_time: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          chapter_id: string
          collection?: string | null
          created_at?: string | null
          description?: string | null
          distance_km: number
          event_date: string
          event_type: string
          external_register_url?: string | null
          id?: string
          image_url?: string | null
          name: string
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          route_id?: string | null
          season?: number | null
          slug: string
          start_location?: string | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string
          collection?: string | null
          created_at?: string | null
          description?: string | null
          distance_km?: number
          event_date?: string
          event_type?: string
          external_register_url?: string | null
          id?: string
          image_url?: string | null
          name?: string
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          route_id?: string | null
          season?: number | null
          slug?: string
          start_location?: string | null
          start_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'events_chapter_id_fkey'
            columns: ['chapter_id']
            isOneToOne: false
            referencedRelation: 'chapters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'events_route_id_fkey'
            columns: ['route_id']
            isOneToOne: false
            referencedRelation: 'routes'
            referencedColumns: ['id']
          },
        ]
      }
      images: {
        Row: {
          alt_text: string | null
          content_type: string
          created_at: string
          filename: string
          height: number | null
          id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          content_type: string
          created_at?: string
          filename: string
          height?: number | null
          id?: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          content_type?: string
          created_at?: string
          filename?: string
          height?: number | null
          id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string | null
          id: string
          membership_id: number
          rider_id: string
          season: number
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          membership_id: number
          rider_id: string
          season: number
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          membership_id?: number
          rider_id?: string
          season?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'memberships_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'public_riders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'riders'
            referencedColumns: ['id']
          },
        ]
      }
      registrations: {
        Row: {
          event_id: string
          id: string
          notes: string | null
          registered_at: string | null
          rider_id: string
          share_registration: boolean | null
          status: string | null
        }
        Insert: {
          event_id: string
          id?: string
          notes?: string | null
          registered_at?: string | null
          rider_id: string
          share_registration?: boolean | null
          status?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          notes?: string | null
          registered_at?: string | null
          rider_id?: string
          share_registration?: boolean | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'registrations_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'registrations_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'public_riders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'registrations_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'riders'
            referencedColumns: ['id']
          },
        ]
      }
      result_awards: {
        Row: {
          award_id: string
          result_id: string
        }
        Insert: {
          award_id: string
          result_id: string
        }
        Update: {
          award_id?: string
          result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'result_awards_award_id_fkey'
            columns: ['award_id']
            isOneToOne: false
            referencedRelation: 'awards'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'result_awards_result_id_fkey'
            columns: ['result_id']
            isOneToOne: false
            referencedRelation: 'public_results'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'result_awards_result_id_fkey'
            columns: ['result_id']
            isOneToOne: false
            referencedRelation: 'results'
            referencedColumns: ['id']
          },
        ]
      }
      results: {
        Row: {
          control_card_back_path: string | null
          control_card_front_path: string | null
          created_at: string | null
          distance_km: number
          event_id: string
          finish_time: string | null
          gpx_file_path: string | null
          gpx_url: string | null
          id: string
          note: string | null
          rider_id: string
          rider_notes: string | null
          season: number
          status: string | null
          submission_token: string | null
          submitted_at: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          control_card_back_path?: string | null
          control_card_front_path?: string | null
          created_at?: string | null
          distance_km: number
          event_id: string
          finish_time?: string | null
          gpx_file_path?: string | null
          gpx_url?: string | null
          id?: string
          note?: string | null
          rider_id: string
          rider_notes?: string | null
          season: number
          status?: string | null
          submission_token?: string | null
          submitted_at?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          control_card_back_path?: string | null
          control_card_front_path?: string | null
          created_at?: string | null
          distance_km?: number
          event_id?: string
          finish_time?: string | null
          gpx_file_path?: string | null
          gpx_url?: string | null
          id?: string
          note?: string | null
          rider_id?: string
          rider_notes?: string | null
          season?: number
          status?: string | null
          submission_token?: string | null
          submitted_at?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'results_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'results_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'public_riders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'results_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'riders'
            referencedColumns: ['id']
          },
        ]
      }
      rider_merges: {
        Row: {
          id: string
          merge_source: string
          merged_at: string | null
          previous_email: string | null
          previous_first_name: string | null
          previous_last_name: string | null
          rider_id: string
          submitted_email: string
          submitted_first_name: string
          submitted_last_name: string
        }
        Insert: {
          id?: string
          merge_source: string
          merged_at?: string | null
          previous_email?: string | null
          previous_first_name?: string | null
          previous_last_name?: string | null
          rider_id: string
          submitted_email: string
          submitted_first_name: string
          submitted_last_name: string
        }
        Update: {
          id?: string
          merge_source?: string
          merged_at?: string | null
          previous_email?: string | null
          previous_first_name?: string | null
          previous_last_name?: string | null
          rider_id?: string
          submitted_email?: string
          submitted_first_name?: string
          submitted_last_name?: string
        }
        Relationships: [
          {
            foreignKeyName: 'rider_merges_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'public_riders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'rider_merges_rider_id_fkey'
            columns: ['rider_id']
            isOneToOne: false
            referencedRelation: 'riders'
            referencedColumns: ['id']
          },
        ]
      }
      riders: {
        Row: {
          created_at: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          full_name: string | null
          gender: string | null
          id: string
          last_name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      routes: {
        Row: {
          chapter_id: string | null
          collection: string | null
          created_at: string | null
          cue_sheet_url: string | null
          description: string | null
          distance_km: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          rwgps_id: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          chapter_id?: string | null
          collection?: string | null
          created_at?: string | null
          cue_sheet_url?: string | null
          description?: string | null
          distance_km?: number | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          rwgps_id?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string | null
          collection?: string | null
          created_at?: string | null
          cue_sheet_url?: string | null
          description?: string | null
          distance_km?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          rwgps_id?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'routes_chapter_id_fkey'
            columns: ['chapter_id']
            isOneToOne: false
            referencedRelation: 'chapters'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      public_results: {
        Row: {
          created_at: string | null
          distance_km: number | null
          event_id: string | null
          finish_time: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          note: string | null
          rider_slug: string | null
          season: number | null
          status: string | null
          team_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'results_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
        ]
      }
      public_riders: {
        Row: {
          created_at: string | null
          first_name: string | null
          gender: string | null
          id: string | null
          last_name: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string | null
          last_name?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string | null
          last_name?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_best_season_distances: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          season: number
          value: number
        }[]
      }
      get_best_season_event_counts: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          season: number
          value: number
        }[]
      }
      get_current_season_distances: {
        Args: { limit_count?: number; p_season: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_distinct_event_seasons: {
        Args: never
        Returns: {
          season: number
        }[]
      }
      get_distinct_seasons: {
        Args: never
        Returns: {
          season: number
        }[]
      }
      get_granite_anvil_completion_counts: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_granite_anvil_fastest_times: {
        Args: { limit_count?: number }
        Returns: {
          event_date: string
          finish_time: string
          rank: number
          rider_name: string
          rider_slug: string
        }[]
      }
      get_pbp_completion_counts: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_pbp_fastest_times: {
        Args: { limit_count?: number }
        Returns: {
          event_date: string
          finish_time: string
          rank: number
          rider_name: string
          rider_slug: string
        }[]
      }
      get_registered_riders: {
        Args: { p_event_id: string }
        Returns: {
          first_name: string
          last_name: string
          share_registration: boolean
        }[]
      }
      get_rider_active_seasons: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_rider_award_counts: {
        Args: { limit_count?: number; p_award_slug: string }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_rider_completion_counts: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_rider_distance_totals: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_rider_longest_streaks: {
        Args: { limit_count?: number; p_current_season: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          streak_end_season: number
          streak_length: number
        }[]
      }
      get_rider_permanent_counts: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          value: number
        }[]
      }
      get_rider_sr_streaks: {
        Args: { limit_count?: number; p_current_season: number }
        Returns: {
          rank: number
          rider_name: string
          rider_slug: string
          streak_end_season: number
          streak_length: number
        }[]
      }
      get_route_frequency_counts: {
        Args: { limit_count?: number }
        Returns: {
          chapter_name: string
          distance_km: number
          rank: number
          route_name: string
          route_slug: string
          value: number
        }[]
      }
      get_route_participant_counts: {
        Args: { limit_count?: number }
        Returns: {
          chapter_name: string
          distance_km: number
          rank: number
          route_name: string
          route_slug: string
          value: number
        }[]
      }
      get_season_event_counts: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          season: number
          value: number
        }[]
      }
      get_season_total_distances: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          season: number
          value: number
        }[]
      }
      get_season_unique_rider_counts: {
        Args: { limit_count?: number }
        Returns: {
          rank: number
          season: number
          value: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_chapter_admin: { Args: { check_chapter_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
