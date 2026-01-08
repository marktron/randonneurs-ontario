export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admins: {
        Row: {
          id: string
          email: string
          name: string
          phone: string | null
          role: 'admin' | 'chapter_admin'
          chapter_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name: string
          phone?: string | null
          role?: 'admin' | 'chapter_admin'
          chapter_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          phone?: string | null
          role?: 'admin' | 'chapter_admin'
          chapter_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_chapter_id_fkey"
            columns: ["chapter_id"]
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          }
        ]
      }
      awards: {
        Row: {
          id: string
          slug: string
          title: string
          description: string | null
          award_type: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          title: string
          description?: string | null
          award_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          description?: string | null
          award_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chapters: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          founded_year: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          founded_year?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          founded_year?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          slug: string
          chapter_id: string
          route_id: string | null
          name: string
          event_type: 'brevet' | 'populaire' | 'fleche' | 'permanent'
          distance_km: number
          event_date: string
          start_time: string | null
          start_location: string | null
          registration_opens_at: string | null
          registration_closes_at: string | null
          external_register_url: string | null
          status: 'scheduled' | 'cancelled' | 'completed'
          season: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          chapter_id: string
          route_id?: string | null
          name: string
          event_type: 'brevet' | 'populaire' | 'fleche' | 'permanent'
          distance_km: number
          event_date: string
          start_time?: string | null
          start_location?: string | null
          registration_opens_at?: string | null
          registration_closes_at?: string | null
          external_register_url?: string | null
          status?: 'scheduled' | 'cancelled' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          chapter_id?: string
          route_id?: string | null
          name?: string
          event_type?: 'brevet' | 'populaire' | 'fleche' | 'permanent'
          distance_km?: number
          event_date?: string
          start_time?: string | null
          start_location?: string | null
          registration_opens_at?: string | null
          registration_closes_at?: string | null
          external_register_url?: string | null
          status?: 'scheduled' | 'cancelled' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_chapter_id_fkey"
            columns: ["chapter_id"]
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_route_id_fkey"
            columns: ["route_id"]
            referencedRelation: "routes"
            referencedColumns: ["id"]
          }
        ]
      }
      registrations: {
        Row: {
          id: string
          event_id: string
          rider_id: string
          registered_at: string
          notes: string | null
          emergency_contact: string | null
          status: 'registered' | 'cancelled'
          share_registration: boolean
        }
        Insert: {
          id?: string
          event_id: string
          rider_id: string
          registered_at?: string
          notes?: string | null
          emergency_contact?: string | null
          status?: 'registered' | 'cancelled'
          share_registration?: boolean
        }
        Update: {
          id?: string
          event_id?: string
          rider_id?: string
          registered_at?: string
          notes?: string | null
          emergency_contact?: string | null
          status?: 'registered' | 'cancelled'
          share_registration?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }
      result_awards: {
        Row: {
          result_id: string
          award_id: string
        }
        Insert: {
          result_id: string
          award_id: string
        }
        Update: {
          result_id?: string
          award_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_awards_result_id_fkey"
            columns: ["result_id"]
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "result_awards_award_id_fkey"
            columns: ["award_id"]
            referencedRelation: "awards"
            referencedColumns: ["id"]
          }
        ]
      }
      results: {
        Row: {
          id: string
          event_id: string
          rider_id: string
          finish_time: string | null
          status: 'finished' | 'dnf' | 'dns' | 'otl' | 'dq'
          note: string | null
          team_name: string | null
          season: number
          distance_km: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          rider_id: string
          finish_time?: string | null
          status?: 'finished' | 'dnf' | 'dns' | 'otl' | 'dq'
          note?: string | null
          team_name?: string | null
          season: number
          distance_km: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          rider_id?: string
          finish_time?: string | null
          status?: 'finished' | 'dnf' | 'dns' | 'otl' | 'dq'
          note?: string | null
          team_name?: string | null
          season?: number
          distance_km?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_event_id_fkey"
            columns: ["event_id"]
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_rider_id_fkey"
            columns: ["rider_id"]
            referencedRelation: "riders"
            referencedColumns: ["id"]
          }
        ]
      }
      riders: {
        Row: {
          id: string
          slug: string
          first_name: string
          last_name: string
          email: string | null
          gender: 'M' | 'F' | 'X' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          first_name: string
          last_name: string
          email?: string | null
          gender?: 'M' | 'F' | 'X' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          first_name?: string
          last_name?: string
          email?: string | null
          gender?: 'M' | 'F' | 'X' | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          id: string
          slug: string
          name: string
          chapter_id: string | null
          distance_km: number | null
          collection: string | null
          description: string | null
          rwgps_id: string | null
          cue_sheet_url: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          chapter_id?: string | null
          distance_km?: number | null
          collection?: string | null
          description?: string | null
          rwgps_id?: string | null
          cue_sheet_url?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          chapter_id?: string | null
          distance_km?: number | null
          collection?: string | null
          description?: string | null
          rwgps_id?: string | null
          cue_sheet_url?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_chapter_id_fkey"
            columns: ["chapter_id"]
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      public_riders: {
        Row: {
          id: string
          slug: string
          first_name: string
          last_name: string
          gender: string | null
          created_at: string
          updated_at: string
        }
      }
      public_results: {
        Row: {
          id: string
          event_id: string
          finish_time: string | null
          status: string
          note: string | null
          team_name: string | null
          season: number
          distance_km: number
          created_at: string
          first_name: string
          last_name: string
        }
      }
    }
    Functions: {
      get_registered_riders: {
        Args: { p_event_id: string }
        Returns: {
          first_name: string
          last_name: string
          share_registration: boolean
        }[]
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_chapter_admin: {
        Args: { check_chapter_id: string }
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

// Convenience types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Table row types
export type Admin = Tables<'admins'>
export type Award = Tables<'awards'>
export type Chapter = Tables<'chapters'>
export type Event = Tables<'events'>
export type Registration = Tables<'registrations'>
export type ResultAward = Tables<'result_awards'>
export type Result = Tables<'results'>
export type Rider = Tables<'riders'>
export type Route = Tables<'routes'>
