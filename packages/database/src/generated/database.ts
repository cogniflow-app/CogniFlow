export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      account_capabilities: {
        Row: {
          account_id: string;
          capability: Database["public"]["Enums"]["account_capability"];
          granted_at: string;
          granted_by: string | null;
          revoked_at: string | null;
        };
        Insert: {
          account_id: string;
          capability: Database["public"]["Enums"]["account_capability"];
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          account_id?: string;
          capability?: Database["public"]["Enums"]["account_capability"];
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "account_capabilities_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_capabilities_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          actor_account_id: string | null;
          actor_guest_session_id: string | null;
          actor_learner_profile_id: string | null;
          actor_type: Database["public"]["Enums"]["audit_actor_type"];
          correlation_id: string;
          event_type: string;
          id: string;
          metadata: Json;
          received_at: string;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          actor_account_id?: string | null;
          actor_guest_session_id?: string | null;
          actor_learner_profile_id?: string | null;
          actor_type: Database["public"]["Enums"]["audit_actor_type"];
          correlation_id: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          received_at?: string;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          actor_account_id?: string | null;
          actor_guest_session_id?: string | null;
          actor_learner_profile_id?: string | null;
          actor_type?: Database["public"]["Enums"]["audit_actor_type"];
          correlation_id?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          received_at?: string;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_actor_learner_profile_id_fkey";
            columns: ["actor_learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      consent_records: {
        Row: {
          action: Database["public"]["Enums"]["consent_action"];
          consent_type: Database["public"]["Enums"]["consent_type"];
          evidence_reference: string | null;
          guardian_account_id: string;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          policy_version: string;
          prior_consent_record_id: string | null;
          reason: string | null;
          recorded_at: string;
          scope: Json;
          verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Insert: {
          action: Database["public"]["Enums"]["consent_action"];
          consent_type: Database["public"]["Enums"]["consent_type"];
          evidence_reference?: string | null;
          guardian_account_id: string;
          id?: string;
          idempotency_key: string;
          learner_profile_id: string;
          policy_version: string;
          prior_consent_record_id?: string | null;
          reason?: string | null;
          recorded_at?: string;
          scope?: Json;
          verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Update: {
          action?: Database["public"]["Enums"]["consent_action"];
          consent_type?: Database["public"]["Enums"]["consent_type"];
          evidence_reference?: string | null;
          guardian_account_id?: string;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
          policy_version?: string;
          prior_consent_record_id?: string | null;
          reason?: string | null;
          recorded_at?: string;
          scope?: Json;
          verification_method?: Database["public"]["Enums"]["consent_verification_method"];
        };
        Relationships: [
          {
            foreignKeyName: "consent_records_guardian_account_id_fkey";
            columns: ["guardian_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consent_records_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consent_records_prior_consent_record_id_fkey";
            columns: ["prior_consent_record_id"];
            isOneToOne: false;
            referencedRelation: "consent_records";
            referencedColumns: ["id"];
          },
        ];
      };
      data_export_jobs: {
        Row: {
          account_id: string;
          completed_at: string | null;
          error_code: string | null;
          expires_at: string | null;
          id: string;
          privacy_request_id: string;
          requested_at: string;
          result_available: boolean;
          started_at: string | null;
          status: Database["public"]["Enums"]["request_status"];
        };
        Insert: {
          account_id: string;
          completed_at?: string | null;
          error_code?: string | null;
          expires_at?: string | null;
          id?: string;
          privacy_request_id: string;
          requested_at?: string;
          result_available?: boolean;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Update: {
          account_id?: string;
          completed_at?: string | null;
          error_code?: string | null;
          expires_at?: string | null;
          id?: string;
          privacy_request_id?: string;
          requested_at?: string;
          result_available?: boolean;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "data_export_jobs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_export_jobs_privacy_request_id_fkey";
            columns: ["privacy_request_id"];
            isOneToOne: true;
            referencedRelation: "privacy_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      deletion_jobs: {
        Row: {
          account_id: string;
          account_tombstone_id: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          completion_idempotency_key: string | null;
          execute_after: string;
          id: string;
          privacy_request_id: string;
          requested_at: string;
          status: Database["public"]["Enums"]["request_status"];
        };
        Insert: {
          account_id: string;
          account_tombstone_id?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          completion_idempotency_key?: string | null;
          execute_after: string;
          id?: string;
          privacy_request_id: string;
          requested_at?: string;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Update: {
          account_id?: string;
          account_tombstone_id?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          completion_idempotency_key?: string | null;
          execute_after?: string;
          id?: string;
          privacy_request_id?: string;
          requested_at?: string;
          status?: Database["public"]["Enums"]["request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "deletion_jobs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deletion_jobs_privacy_request_id_fkey";
            columns: ["privacy_request_id"];
            isOneToOne: true;
            referencedRelation: "privacy_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      devices: {
        Row: {
          account_id: string;
          auth_session_id: string;
          display_name: string;
          first_seen_at: string;
          id: string;
          idempotency_key: string;
          last_reauthenticated_at: string | null;
          last_seen_at: string;
          platform: string;
          revoked_at: string | null;
        };
        Insert: {
          account_id: string;
          auth_session_id: string;
          display_name: string;
          first_seen_at?: string;
          id: string;
          idempotency_key: string;
          last_reauthenticated_at?: string | null;
          last_seen_at?: string;
          platform: string;
          revoked_at?: string | null;
        };
        Update: {
          account_id?: string;
          auth_session_id?: string;
          display_name?: string;
          first_seen_at?: string;
          id?: string;
          idempotency_key?: string;
          last_reauthenticated_at?: string | null;
          last_seen_at?: string;
          platform?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "devices_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      guardian_relationships: {
        Row: {
          activated_at: string | null;
          created_at: string;
          guardian_account_id: string;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          revoked_at: string | null;
          status: Database["public"]["Enums"]["guardian_relationship_status"];
          verification_metadata: Json;
        };
        Insert: {
          activated_at?: string | null;
          created_at?: string;
          guardian_account_id: string;
          id?: string;
          idempotency_key: string;
          learner_profile_id: string;
          revoked_at?: string | null;
          status?: Database["public"]["Enums"]["guardian_relationship_status"];
          verification_metadata?: Json;
        };
        Update: {
          activated_at?: string | null;
          created_at?: string;
          guardian_account_id?: string;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
          revoked_at?: string | null;
          status?: Database["public"]["Enums"]["guardian_relationship_status"];
          verification_metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "guardian_relationships_guardian_account_id_fkey";
            columns: ["guardian_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guardian_relationships_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          game_reference: string;
          id: string;
          idempotency_key: string;
          last_seen_at: string | null;
          nickname: string;
          reconnect_token_hash: string;
          redeemed_at: string | null;
          revoked_at: string | null;
          status: Database["public"]["Enums"]["guest_session_status"];
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          game_reference: string;
          id?: string;
          idempotency_key: string;
          last_seen_at?: string | null;
          nickname: string;
          reconnect_token_hash: string;
          redeemed_at?: string | null;
          revoked_at?: string | null;
          status?: Database["public"]["Enums"]["guest_session_status"];
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          game_reference?: string;
          id?: string;
          idempotency_key?: string;
          last_seen_at?: string | null;
          nickname?: string;
          reconnect_token_hash?: string;
          redeemed_at?: string | null;
          revoked_at?: string | null;
          status?: Database["public"]["Enums"]["guest_session_status"];
        };
        Relationships: [];
      };
      learner_profile_access: {
        Row: {
          account_id: string;
          created_at: string;
          granted_by: string | null;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          permissions: Database["public"]["Enums"]["learner_permission"][];
          revoked_at: string | null;
          role: Database["public"]["Enums"]["learner_access_role"];
        };
        Insert: {
          account_id: string;
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          idempotency_key: string;
          learner_profile_id: string;
          permissions: Database["public"]["Enums"]["learner_permission"][];
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["learner_access_role"];
        };
        Update: {
          account_id?: string;
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
          permissions?: Database["public"]["Enums"]["learner_permission"][];
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["learner_access_role"];
        };
        Relationships: [
          {
            foreignKeyName: "learner_profile_access_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learner_profile_access_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learner_profile_access_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      learner_profiles: {
        Row: {
          age_band: Database["public"]["Enums"]["age_band"];
          avatar_seed: string;
          created_at: string;
          display_name: string | null;
          id: string;
          kind: Database["public"]["Enums"]["learner_profile_kind"];
          owner_account_id: string;
          pseudonym: string;
          settings: Json;
          status: Database["public"]["Enums"]["learner_profile_status"];
          updated_at: string;
        };
        Insert: {
          age_band?: Database["public"]["Enums"]["age_band"];
          avatar_seed: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["learner_profile_kind"];
          owner_account_id: string;
          pseudonym: string;
          settings?: Json;
          status?: Database["public"]["Enums"]["learner_profile_status"];
          updated_at?: string;
        };
        Update: {
          age_band?: Database["public"]["Enums"]["age_band"];
          avatar_seed?: string;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["learner_profile_kind"];
          owner_account_id?: string;
          pseudonym?: string;
          settings?: Json;
          status?: Database["public"]["Enums"]["learner_profile_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "learner_profiles_owner_account_id_fkey";
            columns: ["owner_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      privacy_preferences: {
        Row: {
          account_id: string;
          allow_product_updates: boolean;
          allow_social_interactions: boolean;
          created_at: string;
          data_sale: boolean;
          default_content_private: boolean;
          first_party_analytics: boolean;
          targeted_advertising: boolean;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          allow_product_updates?: boolean;
          allow_social_interactions?: boolean;
          created_at?: string;
          data_sale?: boolean;
          default_content_private?: boolean;
          first_party_analytics?: boolean;
          targeted_advertising?: boolean;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          allow_product_updates?: boolean;
          allow_social_interactions?: boolean;
          created_at?: string;
          data_sale?: boolean;
          default_content_private?: boolean;
          first_party_analytics?: boolean;
          targeted_advertising?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "privacy_preferences_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      privacy_requests: {
        Row: {
          account_id: string;
          completed_at: string | null;
          details: Json;
          id: string;
          idempotency_key: string;
          request_type: Database["public"]["Enums"]["privacy_request_type"];
          requested_at: string;
          status: Database["public"]["Enums"]["request_status"];
          updated_at: string;
        };
        Insert: {
          account_id: string;
          completed_at?: string | null;
          details?: Json;
          id?: string;
          idempotency_key: string;
          request_type: Database["public"]["Enums"]["privacy_request_type"];
          requested_at?: string;
          status?: Database["public"]["Enums"]["request_status"];
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          completed_at?: string | null;
          details?: Json;
          id?: string;
          idempotency_key?: string;
          request_type?: Database["public"]["Enums"]["privacy_request_type"];
          requested_at?: string;
          status?: Database["public"]["Enums"]["request_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "privacy_requests_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_sessions: {
        Row: {
          account_id: string;
          auth_session_id: string;
          created_at: string;
          device_id: string | null;
          expires_at: string;
          id: string;
          idempotency_key: string;
          last_used_at: string | null;
          learner_profile_id: string;
          revoke_reason: string | null;
          revoked_at: string | null;
          token_hash: string;
        };
        Insert: {
          account_id: string;
          auth_session_id: string;
          created_at?: string;
          device_id?: string | null;
          expires_at: string;
          id?: string;
          idempotency_key: string;
          last_used_at?: string | null;
          learner_profile_id: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          account_id?: string;
          auth_session_id?: string;
          created_at?: string;
          device_id?: string | null;
          expires_at?: string;
          id?: string;
          idempotency_key?: string;
          last_used_at?: string | null;
          learner_profile_id?: string;
          revoke_reason?: string | null;
          revoked_at?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_sessions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_sessions_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_sessions_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"];
          age_band: Database["public"]["Enums"]["age_band"];
          auth_subject_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_tombstone_id: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          learning_goals: string[];
          locale: string;
          onboarding_completed_at: string | null;
          reduced_motion: boolean;
          serious_mode: boolean;
          study_day_start: number;
          theme: Database["public"]["Enums"]["theme_preference"];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"];
          age_band?: Database["public"]["Enums"]["age_band"];
          auth_subject_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deletion_tombstone_id?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id: string;
          learning_goals?: string[];
          locale?: string;
          onboarding_completed_at?: string | null;
          reduced_motion?: boolean;
          serious_mode?: boolean;
          study_day_start?: number;
          theme?: Database["public"]["Enums"]["theme_preference"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"];
          age_band?: Database["public"]["Enums"]["age_band"];
          auth_subject_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deletion_tombstone_id?: string | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
          learning_goals?: string[];
          locale?: string;
          onboarding_completed_at?: string | null;
          reduced_motion?: boolean;
          serious_mode?: boolean;
          study_day_start?: number;
          theme?: Database["public"]["Enums"]["theme_preference"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_cancel_account_deletion: {
        Args: {
          p_actor_account_id: string;
          p_deletion_job_id: string;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      admin_complete_current_account_onboarding: {
        Args: {
          p_actor_account_id: string;
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_display_name: string;
          p_handle: string;
          p_idempotency_key: string;
          p_learning_goals: string[];
          p_locale: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_study_day_start: number;
          p_theme: Database["public"]["Enums"]["theme_preference"];
          p_timezone: string;
        };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          age_band: Database["public"]["Enums"]["age_band"];
          auth_subject_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_tombstone_id: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          learning_goals: string[];
          locale: string;
          onboarding_completed_at: string | null;
          reduced_motion: boolean;
          serious_mode: boolean;
          study_day_start: number;
          theme: Database["public"]["Enums"]["theme_preference"];
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_configure_learner_profile_access: {
        Args: {
          p_actor_account_id: string;
          p_family_code: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_lock_after_minutes: number;
          p_pin: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      admin_consume_rate_limit: {
        Args: {
          p_limit: number;
          p_now?: string;
          p_scope: string;
          p_subject_hash: string;
          p_window_seconds: number;
        };
        Returns: {
          allowed: boolean;
          remaining: number;
          retry_after_seconds: number;
        }[];
      };
      admin_create_child_learner: {
        Args: {
          p_actor_account_id: string;
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_avatar_seed: string;
          p_consent_scope: Json;
          p_consent_type: Database["public"]["Enums"]["consent_type"];
          p_display_name: string;
          p_evidence_reference: string;
          p_idempotency_key: string;
          p_policy_version: string;
          p_pseudonym: string;
          p_verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Returns: string;
      };
      admin_create_child_learner_configured: {
        Args: {
          p_actor_account_id: string;
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_avatar_seed: string;
          p_consent_scope: Json;
          p_consent_type: Database["public"]["Enums"]["consent_type"];
          p_display_name: string;
          p_evidence_reference: string;
          p_idempotency_key: string;
          p_policy_version: string;
          p_pseudonym: string;
          p_settings: Json;
          p_verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Returns: string;
      };
      admin_create_guest_session: {
        Args: {
          p_expires_at: string;
          p_game_reference: string;
          p_idempotency_key: string;
          p_nickname: string;
          p_reconnect_token_hash: string;
          p_subject_hash: string;
        };
        Returns: {
          expires_at: string;
          guest_session_id: string;
          nickname: string;
        }[];
      };
      admin_create_profile_session: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_expires_at: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_token_hash: string;
        };
        Returns: {
          account_id: string;
          device_id: string;
          expires_at: string;
          learner_profile_id: string;
          profile_session_id: string;
        }[];
      };
      admin_create_profile_session_with_credentials: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_expires_at: string;
          p_family_code: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_pin: string;
          p_subject_hash: string;
          p_token_hash: string;
        };
        Returns: {
          account_id: string;
          device_id: string;
          expires_at: string;
          learner_profile_id: string;
          profile_session_id: string;
        }[];
      };
      admin_create_school_managed_learner: {
        Args: {
          p_actor_account_id: string;
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_authorization_proof_hash: string;
          p_avatar_seed: string;
          p_display_name: string;
          p_idempotency_key: string;
          p_owner_account_id: string;
          p_pseudonym: string;
          p_settings: Json;
        };
        Returns: string;
      };
      admin_ensure_account: {
        Args: { p_actor_account_id: string };
        Returns: string;
      };
      admin_get_authentication_profile_state: {
        Args: { p_actor_account_id: string };
        Returns: {
          onboarding_completed_at: string;
          profile_exists: boolean;
        }[];
      };
      admin_get_managed_profile_session_context: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_token_hash: string;
        };
        Returns: {
          device_id: string;
          expires_at: string;
          is_active: boolean;
          learner_profile_id: string;
          profile_session_id: string;
          token_matches: boolean;
        }[];
      };
      admin_grant_learner_access: {
        Args: {
          p_account_id: string;
          p_actor_account_id: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_permissions: Database["public"]["Enums"]["learner_permission"][];
          p_role: Database["public"]["Enums"]["learner_access_role"];
        };
        Returns: string;
      };
      admin_guardian_exit_managed_session: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      admin_issue_child_creation_authorization: {
        Args: {
          p_actor_account_id: string;
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_auth_session_id: string;
          p_avatar_seed: string;
          p_consent_scope: Json;
          p_consent_type: Database["public"]["Enums"]["consent_type"];
          p_creation_idempotency_key: string;
          p_display_name: string;
          p_evidence_reference: string;
          p_expires_at: string;
          p_issue_idempotency_key: string;
          p_policy_version: string;
          p_proof_hash: string;
          p_pseudonym: string;
          p_settings: Json;
          p_verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Returns: string;
      };
      admin_issue_onboarding_authorization: {
        Args: {
          p_actor_account_id: string;
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_auth_session_id: string;
          p_completion_idempotency_key: string;
          p_display_name: string;
          p_expires_at: string;
          p_handle: string;
          p_issue_idempotency_key: string;
          p_learning_goals: string[];
          p_locale: string;
          p_proof_hash: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_study_day_start: number;
          p_theme: Database["public"]["Enums"]["theme_preference"];
          p_timezone: string;
        };
        Returns: string;
      };
      admin_issue_reauthentication_grant: {
        Args: {
          p_actor_account_id: string;
          p_expires_at: string;
          p_idempotency_key: string;
          p_proof_hash: string;
          p_purpose: Database["public"]["Enums"]["reauthentication_purpose"];
        };
        Returns: string;
      };
      admin_issue_school_authorization: {
        Args: {
          p_actor_account_id: string;
          p_evidence_reference_hash: string;
          p_expires_at: string;
          p_idempotency_key: string;
          p_owner_account_id: string;
          p_proof_hash: string;
        };
        Returns: string;
      };
      admin_issue_verified_child_creation_authorization: {
        Args: {
          p_actor_account_id: string;
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_auth_session_id: string;
          p_avatar_seed: string;
          p_consent_scope: Json;
          p_consent_type: Database["public"]["Enums"]["consent_type"];
          p_creation_idempotency_key: string;
          p_display_name: string;
          p_evidence_reference: string;
          p_expires_at: string;
          p_issue_idempotency_key: string;
          p_policy_version: string;
          p_proof_hash: string;
          p_pseudonym: string;
          p_settings: Json;
          p_verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Returns: string;
      };
      admin_process_account_deletion: {
        Args: { p_deletion_job_id: string; p_idempotency_key: string };
        Returns: string;
      };
      admin_purge_expired_guest_sessions: {
        Args: { p_before?: string };
        Returns: number;
      };
      admin_record_audit_event: {
        Args: {
          p_actor_account_id: string;
          p_actor_guest_session_id: string;
          p_actor_learner_profile_id: string;
          p_actor_type: Database["public"]["Enums"]["audit_actor_type"];
          p_correlation_id: string;
          p_event_type: string;
          p_metadata?: Json;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: string;
      };
      admin_record_consent: {
        Args: {
          p_actor_account_id: string;
          p_consent_type: Database["public"]["Enums"]["consent_type"];
          p_evidence_reference: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_policy_version: string;
          p_scope: Json;
          p_verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Returns: string;
      };
      admin_register_device: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_display_name: string;
          p_idempotency_key: string;
          p_platform: string;
        };
        Returns: {
          account_id: string;
          auth_session_id: string;
          display_name: string;
          first_seen_at: string;
          id: string;
          idempotency_key: string;
          last_reauthenticated_at: string | null;
          last_seen_at: string;
          platform: string;
          revoked_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "devices";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_register_request_device: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_candidate_device_id: string;
          p_display_name: string;
          p_platform: string;
        };
        Returns: {
          account_id: string;
          auth_session_id: string;
          display_name: string;
          first_seen_at: string;
          id: string;
          idempotency_key: string;
          last_reauthenticated_at: string | null;
          last_seen_at: string;
          platform: string;
          revoked_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "devices";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_reject_provisional_account: {
        Args: { p_actor_account_id: string; p_idempotency_key: string };
        Returns: boolean;
      };
      admin_request_account_deletion: {
        Args: {
          p_actor_account_id: string;
          p_grace_period_days: number;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: string;
      };
      admin_request_data_export: {
        Args: { p_actor_account_id: string; p_idempotency_key: string };
        Returns: string;
      };
      admin_resolve_profile_session: {
        Args: { p_token_hash: string };
        Returns: {
          account_id: string;
          device_id: string;
          expires_at: string;
          learner_age_band: Database["public"]["Enums"]["age_band"];
          learner_kind: Database["public"]["Enums"]["learner_profile_kind"];
          learner_profile_id: string;
          learner_status: Database["public"]["Enums"]["learner_profile_status"];
          profile_session_id: string;
        }[];
      };
      admin_revoke_consent: {
        Args: {
          p_actor_account_id: string;
          p_consent_record_id: string;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: string;
      };
      admin_revoke_device: {
        Args: {
          p_actor_account_id: string;
          p_device_id: string;
          p_idempotency_key: string;
        };
        Returns: boolean;
      };
      admin_revoke_learner_access: {
        Args: {
          p_access_id: string;
          p_actor_account_id: string;
          p_idempotency_key: string;
        };
        Returns: boolean;
      };
      admin_revoke_profile_session: {
        Args: {
          p_actor_account_id: string;
          p_idempotency_key: string;
          p_profile_session_id: string;
          p_reason: string;
        };
        Returns: boolean;
      };
      admin_set_learner_profile_credentials: {
        Args: {
          p_actor_account_id: string;
          p_family_code: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_pin: string;
        };
        Returns: boolean;
      };
      admin_update_current_privacy_preferences: {
        Args: {
          p_actor_account_id: string;
          p_allow_product_updates: boolean;
          p_allow_social_interactions: boolean;
          p_default_content_private: boolean;
          p_first_party_analytics: boolean;
          p_idempotency_key: string;
        };
        Returns: {
          account_id: string;
          allow_product_updates: boolean;
          allow_social_interactions: boolean;
          created_at: string;
          data_sale: boolean;
          default_content_private: boolean;
          first_party_analytics: boolean;
          targeted_advertising: boolean;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "privacy_preferences";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_update_current_profile: {
        Args: {
          p_actor_account_id: string;
          p_display_name: string;
          p_handle: string;
          p_idempotency_key: string;
          p_learning_goals: string[];
          p_locale: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_study_day_start: number;
          p_theme: Database["public"]["Enums"]["theme_preference"];
          p_timezone: string;
        };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          age_band: Database["public"]["Enums"]["age_band"];
          auth_subject_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_tombstone_id: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          learning_goals: string[];
          locale: string;
          onboarding_completed_at: string | null;
          reduced_motion: boolean;
          serious_mode: boolean;
          study_day_start: number;
          theme: Database["public"]["Enums"]["theme_preference"];
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_update_learner_profile: {
        Args: {
          p_actor_account_id: string;
          p_avatar_seed: string;
          p_display_name: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_pseudonym: string;
          p_settings: Json;
        };
        Returns: {
          age_band: Database["public"]["Enums"]["age_band"];
          avatar_seed: string;
          created_at: string;
          display_name: string | null;
          id: string;
          kind: Database["public"]["Enums"]["learner_profile_kind"];
          owner_account_id: string;
          pseudonym: string;
          settings: Json;
          status: Database["public"]["Enums"]["learner_profile_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "learner_profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_verify_learner_profile_credentials: {
        Args: {
          p_family_code: string;
          p_learner_profile_id: string;
          p_pin: string;
          p_subject_hash: string;
        };
        Returns: {
          learner_profile_id: string;
          owner_account_id: string;
        }[];
      };
      complete_current_account_onboarding: {
        Args: {
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_display_name: string;
          p_handle: string;
          p_idempotency_key: string;
          p_learning_goals: string[];
          p_locale: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_study_day_start: number;
          p_theme: Database["public"]["Enums"]["theme_preference"];
          p_timezone: string;
        };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          age_band: Database["public"]["Enums"]["age_band"];
          auth_subject_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_tombstone_id: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          learning_goals: string[];
          locale: string;
          onboarding_completed_at: string | null;
          reduced_motion: boolean;
          serious_mode: boolean;
          study_day_start: number;
          theme: Database["public"]["Enums"]["theme_preference"];
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_assert_self_context: { Args: never; Returns: string };
      current_cancel_account_deletion: {
        Args: {
          p_deletion_job_id: string;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_complete_account_onboarding: {
        Args: {
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_authorization_proof_hash: string;
          p_display_name: string;
          p_handle: string;
          p_idempotency_key: string;
          p_learning_goals: string[];
          p_locale: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_study_day_start: number;
          p_theme: Database["public"]["Enums"]["theme_preference"];
          p_timezone: string;
        };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          age_band: Database["public"]["Enums"]["age_band"];
          auth_subject_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_tombstone_id: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          learning_goals: string[];
          locale: string;
          onboarding_completed_at: string | null;
          reduced_motion: boolean;
          serious_mode: boolean;
          study_day_start: number;
          theme: Database["public"]["Enums"]["theme_preference"];
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_configure_learner_profile_access: {
        Args: {
          p_family_code: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_lock_after_minutes: number;
          p_pin: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_create_child_learner_configured: {
        Args: {
          p_age_band: Database["public"]["Enums"]["age_band"];
          p_authorization_proof_hash: string;
          p_avatar_seed: string;
          p_consent_scope: Json;
          p_consent_type: Database["public"]["Enums"]["consent_type"];
          p_display_name: string;
          p_evidence_reference: string;
          p_idempotency_key: string;
          p_policy_version: string;
          p_pseudonym: string;
          p_settings: Json;
          p_verification_method: Database["public"]["Enums"]["consent_verification_method"];
        };
        Returns: string;
      };
      current_guardian_exit_managed_session: {
        Args: {
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_request_account_deletion: {
        Args: {
          p_grace_period_days: number;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: string;
      };
      current_request_data_export: {
        Args: { p_idempotency_key: string };
        Returns: string;
      };
      current_revoke_consent: {
        Args: {
          p_consent_record_id: string;
          p_idempotency_key: string;
          p_reason: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: string;
      };
      current_revoke_device: {
        Args: {
          p_device_id: string;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_revoke_profile_session: {
        Args: {
          p_idempotency_key: string;
          p_profile_session_id: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_sign_out_all_devices: {
        Args: {
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_sign_out_devices: {
        Args: { p_idempotency_key: string; p_scope: string };
        Returns: boolean;
      };
      current_update_learner_profile: {
        Args: {
          p_avatar_seed: string;
          p_display_name: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_pseudonym: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_theme: Database["public"]["Enums"]["theme_preference"];
        };
        Returns: {
          age_band: Database["public"]["Enums"]["age_band"];
          avatar_seed: string;
          created_at: string;
          display_name: string | null;
          id: string;
          kind: Database["public"]["Enums"]["learner_profile_kind"];
          owner_account_id: string;
          pseudonym: string;
          settings: Json;
          status: Database["public"]["Enums"]["learner_profile_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "learner_profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_update_privacy_preferences: {
        Args: {
          p_allow_product_updates: boolean;
          p_allow_social_interactions: boolean;
          p_default_content_private: boolean;
          p_first_party_analytics: boolean;
          p_idempotency_key: string;
        };
        Returns: {
          account_id: string;
          allow_product_updates: boolean;
          allow_social_interactions: boolean;
          created_at: string;
          data_sale: boolean;
          default_content_private: boolean;
          first_party_analytics: boolean;
          targeted_advertising: boolean;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "privacy_preferences";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_update_profile: {
        Args: {
          p_display_name: string;
          p_handle: string;
          p_idempotency_key: string;
          p_learning_goals: string[];
          p_locale: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_study_day_start: number;
          p_theme: Database["public"]["Enums"]["theme_preference"];
          p_timezone: string;
        };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          age_band: Database["public"]["Enums"]["age_band"];
          auth_subject_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_tombstone_id: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          learning_goals: string[];
          locale: string;
          onboarding_completed_at: string | null;
          reduced_motion: boolean;
          serious_mode: boolean;
          study_day_start: number;
          theme: Database["public"]["Enums"]["theme_preference"];
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ensure_current_account: { Args: never; Returns: string };
      get_observed_learner_profiles: {
        Args: never;
        Returns: {
          access_role: Database["public"]["Enums"]["learner_access_role"];
          age_band: Database["public"]["Enums"]["age_band"];
          display_name: string;
          learner_profile_id: string;
          pseudonym: string;
          status: Database["public"]["Enums"]["learner_profile_status"];
        }[];
      };
      redeem_guest_session: {
        Args: { p_reconnect_token_hash: string };
        Returns: {
          expires_at: string;
          game_reference: string;
          guest_session_id: string;
          nickname: string;
        }[];
      };
      request_data_export: {
        Args: { p_idempotency_key: string };
        Returns: string;
      };
      update_current_privacy_preferences: {
        Args: {
          p_allow_product_updates: boolean;
          p_allow_social_interactions: boolean;
          p_default_content_private: boolean;
          p_first_party_analytics: boolean;
          p_idempotency_key: string;
        };
        Returns: {
          account_id: string;
          allow_product_updates: boolean;
          allow_social_interactions: boolean;
          created_at: string;
          data_sale: boolean;
          default_content_private: boolean;
          first_party_analytics: boolean;
          targeted_advertising: boolean;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "privacy_preferences";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_current_profile: {
        Args: {
          p_display_name: string;
          p_handle: string;
          p_idempotency_key: string;
          p_learning_goals: string[];
          p_locale: string;
          p_reading_style: string;
          p_reduced_motion: boolean;
          p_serious_mode: boolean;
          p_study_day_start: number;
          p_theme: Database["public"]["Enums"]["theme_preference"];
          p_timezone: string;
        };
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"];
          age_band: Database["public"]["Enums"]["age_band"];
          auth_subject_id: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_tombstone_id: string | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          learning_goals: string[];
          locale: string;
          onboarding_completed_at: string | null;
          reduced_motion: boolean;
          serious_mode: boolean;
          study_day_start: number;
          theme: Database["public"]["Enums"]["theme_preference"];
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      account_capability: "learn" | "create" | "host" | "teach";
      account_status: "onboarding" | "active" | "pending_deletion" | "suspended" | "deleted";
      age_band: "under_13" | "teen" | "adult" | "unknown";
      audit_actor_type: "account" | "learner_profile" | "guest" | "system";
      consent_action: "granted" | "revoked";
      consent_type:
        "guardian_account" | "child_profile" | "analytics" | "public_content" | "ai_processing";
      consent_verification_method:
        "not_verified" | "local_test" | "verified_external" | "school_authorization";
      guardian_relationship_status: "pending" | "active" | "revoked";
      guest_session_status: "issued" | "active" | "revoked" | "expired";
      learner_access_role: "self" | "guardian" | "teacher_observer" | "school_admin";
      learner_permission:
        | "view"
        | "study"
        | "manage"
        | "manage_consent"
        | "export_data"
        | "request_deletion"
        | "observe";
      learner_profile_kind: "self" | "child" | "school_managed";
      learner_profile_status: "pending_consent" | "active" | "locked" | "suspended" | "deleted";
      privacy_request_type: "access" | "export" | "deletion" | "correction";
      reauthentication_purpose: "account_deletion" | "security_change";
      request_status: "queued" | "processing" | "completed" | "failed" | "cancelled";
      theme_preference: "system" | "light" | "dark";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_capability: ["learn", "create", "host", "teach"],
      account_status: ["onboarding", "active", "pending_deletion", "suspended", "deleted"],
      age_band: ["under_13", "teen", "adult", "unknown"],
      audit_actor_type: ["account", "learner_profile", "guest", "system"],
      consent_action: ["granted", "revoked"],
      consent_type: [
        "guardian_account",
        "child_profile",
        "analytics",
        "public_content",
        "ai_processing",
      ],
      consent_verification_method: [
        "not_verified",
        "local_test",
        "verified_external",
        "school_authorization",
      ],
      guardian_relationship_status: ["pending", "active", "revoked"],
      guest_session_status: ["issued", "active", "revoked", "expired"],
      learner_access_role: ["self", "guardian", "teacher_observer", "school_admin"],
      learner_permission: [
        "view",
        "study",
        "manage",
        "manage_consent",
        "export_data",
        "request_deletion",
        "observe",
      ],
      learner_profile_kind: ["self", "child", "school_managed"],
      learner_profile_status: ["pending_consent", "active", "locked", "suspended", "deleted"],
      privacy_request_type: ["access", "export", "deletion", "correction"],
      reauthentication_purpose: ["account_deletion", "security_change"],
      request_status: ["queued", "processing", "completed", "failed", "cancelled"],
      theme_preference: ["system", "light", "dark"],
    },
  },
} as const;
