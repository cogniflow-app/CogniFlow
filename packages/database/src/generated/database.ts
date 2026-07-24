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
      accepted_answer_rules: {
        Row: {
          card_id: string;
          created_at: string;
          created_by: string;
          deck_id: string;
          deleted_at: string | null;
          id: string;
          rules: Json;
          schema_version: number;
          updated_at: string;
          version: number;
        };
        Insert: {
          card_id: string;
          created_at?: string;
          created_by: string;
          deck_id: string;
          deleted_at?: string | null;
          id: string;
          rules: Json;
          schema_version?: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          card_id?: string;
          created_at?: string;
          created_by?: string;
          deck_id?: string;
          deleted_at?: string | null;
          id?: string;
          rules?: Json;
          schema_version?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "accepted_answer_rules_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accepted_answer_rules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accepted_answer_rules_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
        ];
      };
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
      answer_overrides: {
        Row: {
          actor_account_id: string;
          created_at: string;
          id: string;
          learner_profile_id: string;
          practice_attempt_id: string;
          previous_verdict: Database["public"]["Enums"]["practice_verdict"];
          reason_code: string;
          replacement_verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Insert: {
          actor_account_id: string;
          created_at?: string;
          id: string;
          learner_profile_id: string;
          practice_attempt_id: string;
          previous_verdict: Database["public"]["Enums"]["practice_verdict"];
          reason_code: string;
          replacement_verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Update: {
          actor_account_id?: string;
          created_at?: string;
          id?: string;
          learner_profile_id?: string;
          practice_attempt_id?: string;
          previous_verdict?: Database["public"]["Enums"]["practice_verdict"];
          reason_code?: string;
          replacement_verdict?: Database["public"]["Enums"]["practice_verdict"];
        };
        Relationships: [
          {
            foreignKeyName: "answer_overrides_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "answer_overrides_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "answer_overrides_practice_attempt_id_fkey";
            columns: ["practice_attempt_id"];
            isOneToOne: true;
            referencedRelation: "practice_attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      audio_prompts: {
        Row: {
          answer: string;
          created_at: string;
          deleted_at: string | null;
          media_asset_id: string | null;
          note_id: string;
          playback_rate: number;
          transcript: string;
          tts_language: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          answer?: string;
          created_at?: string;
          deleted_at?: string | null;
          media_asset_id?: string | null;
          note_id: string;
          playback_rate?: number;
          transcript?: string;
          tts_language?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          answer?: string;
          created_at?: string;
          deleted_at?: string | null;
          media_asset_id?: string | null;
          note_id?: string;
          playback_rate?: number;
          transcript?: string;
          tts_language?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "audio_prompts_media_asset_id_fkey";
            columns: ["media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audio_prompts_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: true;
            referencedRelation: "notes";
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
      card_choices: {
        Row: {
          content_doc: Json;
          created_at: string;
          deleted_at: string | null;
          feedback_doc: Json | null;
          id: string;
          is_correct: boolean;
          note_id: string;
          plain_text: string;
          position: number;
          semantic_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          content_doc: Json;
          created_at?: string;
          deleted_at?: string | null;
          feedback_doc?: Json | null;
          id?: string;
          is_correct: boolean;
          note_id: string;
          plain_text?: string;
          position: number;
          semantic_key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          content_doc?: Json;
          created_at?: string;
          deleted_at?: string | null;
          feedback_doc?: Json | null;
          id?: string;
          is_correct?: boolean;
          note_id?: string;
          plain_text?: string;
          position?: number;
          semantic_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "card_choices_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      card_publications: {
        Row: {
          back_template: string;
          card_kind: Database["public"]["Enums"]["card_kind"];
          card_payload: Json;
          card_public_id: string;
          content_hash: string;
          deck_public_id: string;
          field_values: Json;
          front_template: string;
          generation_key: string;
          ordinal: number;
          published_at: string;
          source_references: Json;
          styling_css: string | null;
          template_key: string;
        };
        Insert: {
          back_template: string;
          card_kind: Database["public"]["Enums"]["card_kind"];
          card_payload: Json;
          card_public_id: string;
          content_hash: string;
          deck_public_id: string;
          field_values: Json;
          front_template: string;
          generation_key: string;
          ordinal: number;
          published_at: string;
          source_references?: Json;
          styling_css?: string | null;
          template_key: string;
        };
        Update: {
          back_template?: string;
          card_kind?: Database["public"]["Enums"]["card_kind"];
          card_payload?: Json;
          card_public_id?: string;
          content_hash?: string;
          deck_public_id?: string;
          field_values?: Json;
          front_template?: string;
          generation_key?: string;
          ordinal?: number;
          published_at?: string;
          source_references?: Json;
          styling_css?: string | null;
          template_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "card_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "deck_publications";
            referencedColumns: ["public_id"];
          },
          {
            foreignKeyName: "card_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "published_decks";
            referencedColumns: ["public_id"];
          },
        ];
      };
      card_schedules: {
        Row: {
          algorithm: Database["public"]["Enums"]["srs_algorithm"];
          buried_until: string | null;
          card_id: string;
          content_version: number;
          created_at: string;
          difficulty: number | null;
          due: string;
          due_order: number | null;
          elapsed_days: number;
          lapses: number;
          last_reviewed_at: string | null;
          learner_profile_id: string;
          learning_step: number;
          leech: boolean;
          legacy_ease_factor: number | null;
          preset_version: number;
          reps: number;
          scheduled_days: number;
          scheduler_version: string;
          stability: number | null;
          starred: boolean;
          state: Database["public"]["Enums"]["srs_state"];
          suspended: boolean;
          suspended_at: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          algorithm: Database["public"]["Enums"]["srs_algorithm"];
          buried_until?: string | null;
          card_id: string;
          content_version: number;
          created_at?: string;
          difficulty?: number | null;
          due: string;
          due_order?: number | null;
          elapsed_days?: number;
          lapses?: number;
          last_reviewed_at?: string | null;
          learner_profile_id: string;
          learning_step?: number;
          leech?: boolean;
          legacy_ease_factor?: number | null;
          preset_version: number;
          reps?: number;
          scheduled_days?: number;
          scheduler_version: string;
          stability?: number | null;
          starred?: boolean;
          state?: Database["public"]["Enums"]["srs_state"];
          suspended?: boolean;
          suspended_at?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          algorithm?: Database["public"]["Enums"]["srs_algorithm"];
          buried_until?: string | null;
          card_id?: string;
          content_version?: number;
          created_at?: string;
          difficulty?: number | null;
          due?: string;
          due_order?: number | null;
          elapsed_days?: number;
          lapses?: number;
          last_reviewed_at?: string | null;
          learner_profile_id?: string;
          learning_step?: number;
          leech?: boolean;
          legacy_ease_factor?: number | null;
          preset_version?: number;
          reps?: number;
          scheduled_days?: number;
          scheduler_version?: string;
          stability?: number | null;
          starred?: boolean;
          state?: Database["public"]["Enums"]["srs_state"];
          suspended?: boolean;
          suspended_at?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "card_schedules_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "card_schedules_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      card_templates: {
        Row: {
          answer_field_key: string | null;
          back_template: string;
          card_kind: Database["public"]["Enums"]["card_kind"];
          created_at: string;
          deleted_at: string | null;
          front_template: string;
          generation_condition: string | null;
          id: string;
          name: string;
          note_type_id: string;
          ordinal: number;
          schema_version: number;
          styling_css: string | null;
          template_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          answer_field_key?: string | null;
          back_template: string;
          card_kind: Database["public"]["Enums"]["card_kind"];
          created_at?: string;
          deleted_at?: string | null;
          front_template: string;
          generation_condition?: string | null;
          id?: string;
          name: string;
          note_type_id: string;
          ordinal: number;
          schema_version?: number;
          styling_css?: string | null;
          template_key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          answer_field_key?: string | null;
          back_template?: string;
          card_kind?: Database["public"]["Enums"]["card_kind"];
          created_at?: string;
          deleted_at?: string | null;
          front_template?: string;
          generation_condition?: string | null;
          id?: string;
          name?: string;
          note_type_id?: string;
          ordinal?: number;
          schema_version?: number;
          styling_css?: string | null;
          template_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "card_templates_note_type_id_fkey";
            columns: ["note_type_id"];
            isOneToOne: false;
            referencedRelation: "note_types";
            referencedColumns: ["id"];
          },
        ];
      };
      cards: {
        Row: {
          active: boolean;
          card_kind: Database["public"]["Enums"]["card_kind"];
          content_version: number;
          created_at: string;
          deactivated_at: string | null;
          deleted_at: string | null;
          generation_key: string;
          id: string;
          note_id: string;
          ordinal: number;
          template_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          card_kind: Database["public"]["Enums"]["card_kind"];
          content_version: number;
          created_at?: string;
          deactivated_at?: string | null;
          deleted_at?: string | null;
          generation_key: string;
          id?: string;
          note_id: string;
          ordinal: number;
          template_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          card_kind?: Database["public"]["Enums"]["card_kind"];
          content_version?: number;
          created_at?: string;
          deactivated_at?: string | null;
          deleted_at?: string | null;
          generation_key?: string;
          id?: string;
          note_id?: string;
          ordinal?: number;
          template_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cards_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cards_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "card_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      cloze_definitions: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          hint: string | null;
          id: string;
          note_id: string;
          position: number;
          ranges: Json;
          semantic_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          hint?: string | null;
          id?: string;
          note_id: string;
          position?: number;
          ranges: Json;
          semantic_key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          hint?: string | null;
          id?: string;
          note_id?: string;
          position?: number;
          ranges?: Json;
          semantic_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cloze_definitions_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      concept_mastery: {
        Row: {
          card_id: string;
          content_version: number;
          evidence_count: number;
          last_evidence_at: string | null;
          learner_profile_id: string;
          overall: number;
          recall: number;
          recognition: number;
          spaced_recall_successes: number;
          stage: Database["public"]["Enums"]["mastery_stage"];
          updated_at: string;
          version: number;
        };
        Insert: {
          card_id: string;
          content_version: number;
          evidence_count?: number;
          last_evidence_at?: string | null;
          learner_profile_id: string;
          overall?: number;
          recall?: number;
          recognition?: number;
          spaced_recall_successes?: number;
          stage?: Database["public"]["Enums"]["mastery_stage"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          card_id?: string;
          content_version?: number;
          evidence_count?: number;
          last_evidence_at?: string | null;
          learner_profile_id?: string;
          overall?: number;
          recall?: number;
          recognition?: number;
          spaced_recall_successes?: number;
          stage?: Database["public"]["Enums"]["mastery_stage"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "concept_mastery_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "concept_mastery_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
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
      content_change_impacts: {
        Row: {
          affected_generation_keys: string[];
          classification: Database["public"]["Enums"]["content_change_classification"];
          created_at: string;
          created_by: string;
          deck_id: string;
          from_note_version: number;
          id: string;
          note_id: string;
          resolution: Database["public"]["Enums"]["content_change_resolution"];
          resolved_at: string | null;
          to_note_version: number;
        };
        Insert: {
          affected_generation_keys?: string[];
          classification: Database["public"]["Enums"]["content_change_classification"];
          created_at?: string;
          created_by: string;
          deck_id: string;
          from_note_version: number;
          id?: string;
          note_id: string;
          resolution?: Database["public"]["Enums"]["content_change_resolution"];
          resolved_at?: string | null;
          to_note_version: number;
        };
        Update: {
          affected_generation_keys?: string[];
          classification?: Database["public"]["Enums"]["content_change_classification"];
          created_at?: string;
          created_by?: string;
          deck_id?: string;
          from_note_version?: number;
          id?: string;
          note_id?: string;
          resolution?: Database["public"]["Enums"]["content_change_resolution"];
          resolved_at?: string | null;
          to_note_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "content_change_impacts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_change_impacts_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_change_impacts_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      content_change_schedule_decisions: {
        Row: {
          affected_schedule_count: number;
          choice: Database["public"]["Enums"]["content_change_resolution"];
          content_change_impact_id: string;
          decided_at: string;
          decided_by_account_id: string;
          idempotency_key: string;
          learner_profile_id: string;
        };
        Insert: {
          affected_schedule_count: number;
          choice: Database["public"]["Enums"]["content_change_resolution"];
          content_change_impact_id: string;
          decided_at?: string;
          decided_by_account_id: string;
          idempotency_key: string;
          learner_profile_id: string;
        };
        Update: {
          affected_schedule_count?: number;
          choice?: Database["public"]["Enums"]["content_change_resolution"];
          content_change_impact_id?: string;
          decided_at?: string;
          decided_by_account_id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_change_schedule_decisions_content_change_impact_id_fkey";
            columns: ["content_change_impact_id"];
            isOneToOne: false;
            referencedRelation: "content_change_impacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_change_schedule_decisions_decided_by_account_id_fkey";
            columns: ["decided_by_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_change_schedule_decisions_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_study_counters: {
        Row: {
          again_count: number;
          easy_count: number;
          good_count: number;
          hard_count: number;
          learner_profile_id: string;
          learning_reviewed: number;
          new_reviewed: number;
          review_reviewed: number;
          study_day: string;
          total_duration_ms: number;
          updated_at: string;
        };
        Insert: {
          again_count?: number;
          easy_count?: number;
          good_count?: number;
          hard_count?: number;
          learner_profile_id: string;
          learning_reviewed?: number;
          new_reviewed?: number;
          review_reviewed?: number;
          study_day: string;
          total_duration_ms?: number;
          updated_at?: string;
        };
        Update: {
          again_count?: number;
          easy_count?: number;
          good_count?: number;
          hard_count?: number;
          learner_profile_id?: string;
          learning_reviewed?: number;
          new_reviewed?: number;
          review_reviewed?: number;
          study_day?: string;
          total_duration_ms?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_study_counters_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
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
          portability_export_job_id: string | null;
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
          portability_export_job_id?: string | null;
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
          portability_export_job_id?: string | null;
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
            foreignKeyName: "data_export_jobs_portability_export_job_id_fkey";
            columns: ["portability_export_job_id"];
            isOneToOne: false;
            referencedRelation: "export_jobs";
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
      deck_members: {
        Row: {
          account_id: string;
          created_at: string;
          deck_id: string;
          granted_by: string | null;
          id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["deck_member_role"];
          updated_at: string;
          version: number;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          deck_id: string;
          granted_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["deck_member_role"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          deck_id?: string;
          granted_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["deck_member_role"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deck_members_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deck_members_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deck_members_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deck_publications: {
        Row: {
          card_count: number;
          card_kinds: Database["public"]["Enums"]["card_kind"][];
          content_hash: string;
          cover_media_public_id: string | null;
          creator_display_name: string;
          creator_handle: string;
          description_doc: Json;
          description_plain: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          public_id: string;
          published_at: string;
          published_version: number;
          slug: string;
          theme: string;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        Insert: {
          card_count: number;
          card_kinds?: Database["public"]["Enums"]["card_kind"][];
          content_hash: string;
          cover_media_public_id?: string | null;
          creator_display_name: string;
          creator_handle: string;
          description_doc: Json;
          description_plain: string;
          language_back?: string | null;
          language_front?: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          public_id: string;
          published_at: string;
          published_version: number;
          slug: string;
          theme?: string;
          title: string;
          updated_at?: string;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        Update: {
          card_count?: number;
          card_kinds?: Database["public"]["Enums"]["card_kind"][];
          content_hash?: string;
          cover_media_public_id?: string | null;
          creator_display_name?: string;
          creator_handle?: string;
          description_doc?: Json;
          description_plain?: string;
          language_back?: string | null;
          language_front?: string | null;
          license?: Database["public"]["Enums"]["deck_license"];
          public_id?: string;
          published_at?: string;
          published_version?: number;
          slug?: string;
          theme?: string;
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["deck_visibility"];
        };
        Relationships: [];
      };
      deck_srs_settings: {
        Row: {
          created_at: string;
          deck_id: string;
          learner_profile_id: string;
          preset_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          deck_id: string;
          learner_profile_id: string;
          preset_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          deck_id?: string;
          learner_profile_id?: string;
          preset_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deck_srs_settings_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deck_srs_settings_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deck_srs_settings_preset_id_fkey";
            columns: ["preset_id"];
            isOneToOne: false;
            referencedRelation: "srs_presets";
            referencedColumns: ["id"];
          },
        ];
      };
      deck_versions: {
        Row: {
          change_kind: string;
          content_hash: string;
          content_snapshot: Json;
          created_at: string;
          created_by: string;
          deck_id: string;
          deck_snapshot: Json;
          id: string;
          idempotency_key: string;
          restored_from_version: number | null;
          summary: string;
          version_number: number;
        };
        Insert: {
          change_kind: string;
          content_hash: string;
          content_snapshot: Json;
          created_at?: string;
          created_by: string;
          deck_id: string;
          deck_snapshot: Json;
          id?: string;
          idempotency_key: string;
          restored_from_version?: number | null;
          summary?: string;
          version_number: number;
        };
        Update: {
          change_kind?: string;
          content_hash?: string;
          content_snapshot?: Json;
          created_at?: string;
          created_by?: string;
          deck_id?: string;
          deck_snapshot?: Json;
          id?: string;
          idempotency_key?: string;
          restored_from_version?: number | null;
          summary?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deck_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deck_versions_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
        ];
      };
      decks: {
        Row: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        Insert: {
          archived_at?: string | null;
          card_count?: number;
          content_hash: string;
          cover_asset_id?: string | null;
          created_at?: string;
          current_version?: number;
          default_note_type_id: string;
          deleted_at?: string | null;
          description_doc?: Json;
          description_plain?: string;
          fork_mode?: string | null;
          id?: string;
          language_back?: string | null;
          language_front?: string | null;
          license?: Database["public"]["Enums"]["deck_license"];
          note_count?: number;
          owner_account_id: string;
          public_id?: string;
          published_at?: string | null;
          published_version?: number | null;
          slug: string;
          source_deck_id?: string | null;
          status?: Database["public"]["Enums"]["deck_status"];
          theme?: string;
          title: string;
          updated_at?: string;
          version?: number;
          visibility?: Database["public"]["Enums"]["deck_visibility"];
        };
        Update: {
          archived_at?: string | null;
          card_count?: number;
          content_hash?: string;
          cover_asset_id?: string | null;
          created_at?: string;
          current_version?: number;
          default_note_type_id?: string;
          deleted_at?: string | null;
          description_doc?: Json;
          description_plain?: string;
          fork_mode?: string | null;
          id?: string;
          language_back?: string | null;
          language_front?: string | null;
          license?: Database["public"]["Enums"]["deck_license"];
          note_count?: number;
          owner_account_id?: string;
          public_id?: string;
          published_at?: string | null;
          published_version?: number | null;
          slug?: string;
          source_deck_id?: string | null;
          status?: Database["public"]["Enums"]["deck_status"];
          theme?: string;
          title?: string;
          updated_at?: string;
          version?: number;
          visibility?: Database["public"]["Enums"]["deck_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "decks_cover_asset_id_fkey";
            columns: ["cover_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decks_default_note_type_id_fkey";
            columns: ["default_note_type_id"];
            isOneToOne: false;
            referencedRelation: "note_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decks_owner_account_id_fkey";
            columns: ["owner_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decks_source_deck_id_fkey";
            columns: ["source_deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
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
      diagram_hotspots: {
        Row: {
          aliases: string[];
          created_at: string;
          deleted_at: string | null;
          geometry: Json;
          geometry_kind: Database["public"]["Enums"]["geometry_kind"];
          id: string;
          label: string;
          note_id: string;
          position: number;
          prompt_direction: Database["public"]["Enums"]["diagram_prompt_direction"];
          semantic_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          aliases?: string[];
          created_at?: string;
          deleted_at?: string | null;
          geometry: Json;
          geometry_kind: Database["public"]["Enums"]["geometry_kind"];
          id?: string;
          label: string;
          note_id: string;
          position?: number;
          prompt_direction?: Database["public"]["Enums"]["diagram_prompt_direction"];
          semantic_key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          aliases?: string[];
          created_at?: string;
          deleted_at?: string | null;
          geometry?: Json;
          geometry_kind?: Database["public"]["Enums"]["geometry_kind"];
          id?: string;
          label?: string;
          note_id?: string;
          position?: number;
          prompt_direction?: Database["public"]["Enums"]["diagram_prompt_direction"];
          semantic_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "diagram_hotspots_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      drawing_reference_layers: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          media_asset_id: string | null;
          note_id: string;
          opacity: number;
          position: number;
          semantic_key: string;
          strokes: Json | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          media_asset_id?: string | null;
          note_id: string;
          opacity?: number;
          position?: number;
          semantic_key: string;
          strokes?: Json | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          media_asset_id?: string | null;
          note_id?: string;
          opacity?: number;
          position?: number;
          semantic_key?: string;
          strokes?: Json | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "drawing_reference_layers_media_asset_id_fkey";
            columns: ["media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drawing_reference_layers_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_plans: {
        Row: {
          actor_account_id: string;
          assumptions: Json;
          config_schema_version: number;
          created_at: string;
          exam_at: string;
          id: string;
          learner_profile_id: string;
          name: string;
          plan: Json;
          scope: Json;
          status: Database["public"]["Enums"]["exam_plan_status"];
          timezone: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          actor_account_id: string;
          assumptions: Json;
          config_schema_version?: number;
          created_at?: string;
          exam_at: string;
          id: string;
          learner_profile_id: string;
          name: string;
          plan: Json;
          scope: Json;
          status?: Database["public"]["Enums"]["exam_plan_status"];
          timezone: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          actor_account_id?: string;
          assumptions?: Json;
          config_schema_version?: number;
          created_at?: string;
          exam_at?: string;
          id?: string;
          learner_profile_id?: string;
          name?: string;
          plan?: Json;
          scope?: Json;
          status?: Database["public"]["Enums"]["exam_plan_status"];
          timezone?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_plans_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_plans_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      export_artifacts: {
        Row: {
          account_id: string;
          available: boolean;
          byte_size: number;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          expires_at: string;
          export_job_id: string;
          format: Database["public"]["Enums"]["portability_format"];
          id: string;
          loss_summary: Json;
          mime_type: string;
          sha256: string;
          warning_count: number;
        };
        Insert: {
          account_id: string;
          available?: boolean;
          byte_size: number;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          expires_at: string;
          export_job_id: string;
          format: Database["public"]["Enums"]["portability_format"];
          id?: string;
          loss_summary?: Json;
          mime_type: string;
          sha256: string;
          warning_count?: number;
        };
        Update: {
          account_id?: string;
          available?: boolean;
          byte_size?: number;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          expires_at?: string;
          export_job_id?: string;
          format?: Database["public"]["Enums"]["portability_format"];
          id?: string;
          loss_summary?: Json;
          mime_type?: string;
          sha256?: string;
          warning_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "export_artifacts_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "export_artifacts_export_job_id_fkey";
            columns: ["export_job_id"];
            isOneToOne: false;
            referencedRelation: "export_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      export_jobs: {
        Row: {
          account_id: string;
          adapter_code: string;
          cancelled_at: string | null;
          completed_at: string | null;
          current_phase: string;
          error_count: number;
          expires_at: string;
          export_format: Database["public"]["Enums"]["portability_format"];
          export_scope: Json;
          id: string;
          idempotency_key: string;
          learner_profile_id: string | null;
          payload_fingerprint: string;
          processed_count: number;
          requested_at: string;
          requested_options: Json;
          safe_error_code: string | null;
          safe_error_summary: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["portability_job_status"];
          total_count: number | null;
          updated_at: string;
          warning_count: number;
        };
        Insert: {
          account_id: string;
          adapter_code: string;
          cancelled_at?: string | null;
          completed_at?: string | null;
          current_phase?: string;
          error_count?: number;
          expires_at?: string;
          export_format: Database["public"]["Enums"]["portability_format"];
          export_scope: Json;
          id?: string;
          idempotency_key: string;
          learner_profile_id?: string | null;
          payload_fingerprint: string;
          processed_count?: number;
          requested_at?: string;
          requested_options?: Json;
          safe_error_code?: string | null;
          safe_error_summary?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["portability_job_status"];
          total_count?: number | null;
          updated_at?: string;
          warning_count?: number;
        };
        Update: {
          account_id?: string;
          adapter_code?: string;
          cancelled_at?: string | null;
          completed_at?: string | null;
          current_phase?: string;
          error_count?: number;
          expires_at?: string;
          export_format?: Database["public"]["Enums"]["portability_format"];
          export_scope?: Json;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string | null;
          payload_fingerprint?: string;
          processed_count?: number;
          requested_at?: string;
          requested_options?: Json;
          safe_error_code?: string | null;
          safe_error_summary?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["portability_job_status"];
          total_count?: number | null;
          updated_at?: string;
          warning_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "export_jobs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "export_jobs_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      folder_items: {
        Row: {
          created_at: string;
          deck_id: string;
          deleted_at: string | null;
          folder_id: string;
          id: string;
          position: number;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          deck_id: string;
          deleted_at?: string | null;
          folder_id: string;
          id?: string;
          position?: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          deck_id?: string;
          deleted_at?: string | null;
          folder_id?: string;
          id?: string;
          position?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "folder_items_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folder_items_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      folders: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          owner_account_id: string;
          parent_id: string | null;
          position: number;
          status: Database["public"]["Enums"]["folder_status"];
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          owner_account_id: string;
          parent_id?: string | null;
          position?: number;
          status?: Database["public"]["Enums"]["folder_status"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          owner_account_id?: string;
          parent_id?: string | null;
          position?: number;
          status?: Database["public"]["Enums"]["folder_status"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "folders_owner_account_id_fkey";
            columns: ["owner_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "folders";
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
      image_occlusions: {
        Row: {
          alt_text: string | null;
          created_at: string;
          deleted_at: string | null;
          geometry: Json;
          geometry_kind: Database["public"]["Enums"]["geometry_kind"];
          group_key: string;
          id: string;
          label: string;
          mode: Database["public"]["Enums"]["occlusion_mode"];
          note_id: string;
          position: number;
          semantic_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          alt_text?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          geometry: Json;
          geometry_kind: Database["public"]["Enums"]["geometry_kind"];
          group_key: string;
          id?: string;
          label: string;
          mode?: Database["public"]["Enums"]["occlusion_mode"];
          note_id: string;
          position?: number;
          semantic_key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          alt_text?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          geometry?: Json;
          geometry_kind?: Database["public"]["Enums"]["geometry_kind"];
          group_key?: string;
          id?: string;
          label?: string;
          mode?: Database["public"]["Enums"]["occlusion_mode"];
          note_id?: string;
          position?: number;
          semantic_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "image_occlusions_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      import_jobs: {
        Row: {
          account_id: string;
          adapter_code: string;
          cancelled_at: string | null;
          completed_at: string | null;
          current_phase: string;
          error_count: number;
          expires_at: string;
          id: string;
          idempotency_key: string;
          inspection_summary: Json;
          kind: Database["public"]["Enums"]["portability_job_kind"];
          learner_profile_id: string | null;
          payload_fingerprint: string;
          processed_count: number;
          requested_at: string;
          requested_policy: Json;
          safe_error_code: string | null;
          safe_error_summary: string | null;
          source_byte_size: number;
          source_display_name: string;
          source_format: Database["public"]["Enums"]["portability_format"];
          source_sha256: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["portability_job_status"];
          total_count: number | null;
          updated_at: string;
          warning_count: number;
        };
        Insert: {
          account_id: string;
          adapter_code: string;
          cancelled_at?: string | null;
          completed_at?: string | null;
          current_phase?: string;
          error_count?: number;
          expires_at?: string;
          id?: string;
          idempotency_key: string;
          inspection_summary?: Json;
          kind?: Database["public"]["Enums"]["portability_job_kind"];
          learner_profile_id?: string | null;
          payload_fingerprint: string;
          processed_count?: number;
          requested_at?: string;
          requested_policy?: Json;
          safe_error_code?: string | null;
          safe_error_summary?: string | null;
          source_byte_size: number;
          source_display_name: string;
          source_format: Database["public"]["Enums"]["portability_format"];
          source_sha256: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["portability_job_status"];
          total_count?: number | null;
          updated_at?: string;
          warning_count?: number;
        };
        Update: {
          account_id?: string;
          adapter_code?: string;
          cancelled_at?: string | null;
          completed_at?: string | null;
          current_phase?: string;
          error_count?: number;
          expires_at?: string;
          id?: string;
          idempotency_key?: string;
          inspection_summary?: Json;
          kind?: Database["public"]["Enums"]["portability_job_kind"];
          learner_profile_id?: string | null;
          payload_fingerprint?: string;
          processed_count?: number;
          requested_at?: string;
          requested_policy?: Json;
          safe_error_code?: string | null;
          safe_error_summary?: string | null;
          source_byte_size?: number;
          source_display_name?: string;
          source_format?: Database["public"]["Enums"]["portability_format"];
          source_sha256?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["portability_job_status"];
          total_count?: number | null;
          updated_at?: string;
          warning_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_jobs_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
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
      learning_goals: {
        Row: {
          actor_account_id: string;
          completed_at: string | null;
          created_at: string;
          goal_type: string;
          id: string;
          learner_profile_id: string;
          name: string;
          progress: Json;
          status: Database["public"]["Enums"]["learning_goal_status"];
          target: Json;
          updated_at: string;
          version: number;
        };
        Insert: {
          actor_account_id: string;
          completed_at?: string | null;
          created_at?: string;
          goal_type: string;
          id: string;
          learner_profile_id: string;
          name: string;
          progress?: Json;
          status?: Database["public"]["Enums"]["learning_goal_status"];
          target: Json;
          updated_at?: string;
          version?: number;
        };
        Update: {
          actor_account_id?: string;
          completed_at?: string | null;
          created_at?: string;
          goal_type?: string;
          id?: string;
          learner_profile_id?: string;
          name?: string;
          progress?: Json;
          status?: Database["public"]["Enums"]["learning_goal_status"];
          target?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "learning_goals_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "learning_goals_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      list_answer_items: {
        Row: {
          aliases: string[];
          answer: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          note_id: string;
          position: number;
          required: boolean;
          semantic_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          aliases?: string[];
          answer: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          note_id: string;
          position: number;
          required?: boolean;
          semantic_key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          aliases?: string[];
          answer?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          note_id?: string;
          position?: number;
          required?: boolean;
          semantic_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "list_answer_items_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          alt_text: string | null;
          byte_size: number;
          created_at: string;
          delete_after: string | null;
          deleted_at: string | null;
          detected_mime_type: string | null;
          duration_ms: number | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          magic_verified: boolean;
          metadata: Json;
          mime_type: string;
          owner_account_id: string;
          public_id: string;
          reference_count: number;
          sha256: string;
          status: Database["public"]["Enums"]["media_status"];
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          version: number;
          width: number | null;
        };
        Insert: {
          alt_text?: string | null;
          byte_size: number;
          created_at?: string;
          delete_after?: string | null;
          deleted_at?: string | null;
          detected_mime_type?: string | null;
          duration_ms?: number | null;
          height?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["media_kind"];
          magic_verified?: boolean;
          metadata?: Json;
          mime_type: string;
          owner_account_id: string;
          public_id?: string;
          reference_count?: number;
          sha256: string;
          status?: Database["public"]["Enums"]["media_status"];
          storage_bucket?: string;
          storage_path: string;
          updated_at?: string;
          version?: number;
          width?: number | null;
        };
        Update: {
          alt_text?: string | null;
          byte_size?: number;
          created_at?: string;
          delete_after?: string | null;
          deleted_at?: string | null;
          detected_mime_type?: string | null;
          duration_ms?: number | null;
          height?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          magic_verified?: boolean;
          metadata?: Json;
          mime_type?: string;
          owner_account_id?: string;
          public_id?: string;
          reference_count?: number;
          sha256?: string;
          status?: Database["public"]["Enums"]["media_status"];
          storage_bucket?: string;
          storage_path?: string;
          updated_at?: string;
          version?: number;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_owner_account_id_fkey";
            columns: ["owner_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      media_publications: {
        Row: {
          alt_text: string | null;
          byte_size: number;
          deck_public_id: string;
          duration_ms: number | null;
          height: number | null;
          kind: Database["public"]["Enums"]["media_kind"];
          media_public_id: string;
          mime_type: string;
          published_at: string;
          storage_bucket: string;
          storage_path: string;
          width: number | null;
        };
        Insert: {
          alt_text?: string | null;
          byte_size: number;
          deck_public_id: string;
          duration_ms?: number | null;
          height?: number | null;
          kind: Database["public"]["Enums"]["media_kind"];
          media_public_id: string;
          mime_type: string;
          published_at: string;
          storage_bucket: string;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          alt_text?: string | null;
          byte_size?: number;
          deck_public_id?: string;
          duration_ms?: number | null;
          height?: number | null;
          kind?: Database["public"]["Enums"]["media_kind"];
          media_public_id?: string;
          mime_type?: string;
          published_at?: string;
          storage_bucket?: string;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "deck_publications";
            referencedColumns: ["public_id"];
          },
          {
            foreignKeyName: "media_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "published_decks";
            referencedColumns: ["public_id"];
          },
        ];
      };
      media_references: {
        Row: {
          alt_text: string | null;
          created_at: string;
          created_by: string;
          deck_id: string;
          deleted_at: string | null;
          field_value_id: string | null;
          id: string;
          media_asset_id: string;
          note_id: string | null;
          owner_id: string;
          position: number;
          purpose: Database["public"]["Enums"]["media_reference_purpose"];
          reference_type: Database["public"]["Enums"]["media_reference_type"];
          updated_at: string;
          version: number;
        };
        Insert: {
          alt_text?: string | null;
          created_at?: string;
          created_by: string;
          deck_id: string;
          deleted_at?: string | null;
          field_value_id?: string | null;
          id?: string;
          media_asset_id: string;
          note_id?: string | null;
          owner_id: string;
          position?: number;
          purpose: Database["public"]["Enums"]["media_reference_purpose"];
          reference_type: Database["public"]["Enums"]["media_reference_type"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          alt_text?: string | null;
          created_at?: string;
          created_by?: string;
          deck_id?: string;
          deleted_at?: string | null;
          field_value_id?: string | null;
          id?: string;
          media_asset_id?: string;
          note_id?: string | null;
          owner_id?: string;
          position?: number;
          purpose?: Database["public"]["Enums"]["media_reference_purpose"];
          reference_type?: Database["public"]["Enums"]["media_reference_type"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "media_references_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_references_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_references_field_value_id_fkey";
            columns: ["field_value_id"];
            isOneToOne: false;
            referencedRelation: "note_field_values";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_references_media_asset_id_fkey";
            columns: ["media_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_references_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      note_field_values: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          field_id: string;
          id: string;
          normalized_text: string;
          note_id: string;
          plain_text: string;
          position: number;
          updated_at: string;
          value_doc: Json;
          version: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          field_id: string;
          id?: string;
          normalized_text?: string;
          note_id: string;
          plain_text?: string;
          position: number;
          updated_at?: string;
          value_doc: Json;
          version?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          field_id?: string;
          id?: string;
          normalized_text?: string;
          note_id?: string;
          plain_text?: string;
          position?: number;
          updated_at?: string;
          value_doc?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "note_field_values_field_id_fkey";
            columns: ["field_id"];
            isOneToOne: false;
            referencedRelation: "note_type_fields";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_field_values_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      note_revisions: {
        Row: {
          card_payload_snapshot: Json;
          change_kind: string;
          content_hash: string;
          created_at: string;
          created_by: string;
          deck_id: string;
          fields_snapshot: Json;
          id: string;
          idempotency_key: string;
          note_id: string;
          note_snapshot: Json;
          note_version: number;
        };
        Insert: {
          card_payload_snapshot: Json;
          change_kind: string;
          content_hash: string;
          created_at?: string;
          created_by: string;
          deck_id: string;
          fields_snapshot: Json;
          id?: string;
          idempotency_key: string;
          note_id: string;
          note_snapshot: Json;
          note_version: number;
        };
        Update: {
          card_payload_snapshot?: Json;
          change_kind?: string;
          content_hash?: string;
          created_at?: string;
          created_by?: string;
          deck_id?: string;
          fields_snapshot?: Json;
          id?: string;
          idempotency_key?: string;
          note_id?: string;
          note_snapshot?: Json;
          note_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "note_revisions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_revisions_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_revisions_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      note_tags: {
        Row: {
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          note_id: string;
          tag_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          note_id: string;
          tag_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          note_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "note_tags_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_tags_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "note_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      note_type_fields: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          display_settings: Json;
          field_key: string;
          field_type: Database["public"]["Enums"]["note_field_type"];
          grading_settings: Json;
          id: string;
          label: string;
          language: string | null;
          note_type_id: string;
          position: number;
          required: boolean;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          display_settings?: Json;
          field_key: string;
          field_type?: Database["public"]["Enums"]["note_field_type"];
          grading_settings?: Json;
          id?: string;
          label: string;
          language?: string | null;
          note_type_id: string;
          position: number;
          required?: boolean;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          display_settings?: Json;
          field_key?: string;
          field_type?: Database["public"]["Enums"]["note_field_type"];
          grading_settings?: Json;
          id?: string;
          label?: string;
          language?: string | null;
          note_type_id?: string;
          position?: number;
          required?: boolean;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "note_type_fields_note_type_id_fkey";
            columns: ["note_type_id"];
            isOneToOne: false;
            referencedRelation: "note_types";
            referencedColumns: ["id"];
          },
        ];
      };
      note_types: {
        Row: {
          card_kind: Database["public"]["Enums"]["card_kind"];
          code: string;
          created_at: string;
          deleted_at: string | null;
          description: string;
          display_name: string;
          id: string;
          is_system: boolean;
          owner_account_id: string | null;
          schema_version: number;
          template_policy: Json;
          updated_at: string;
          version: number;
        };
        Insert: {
          card_kind: Database["public"]["Enums"]["card_kind"];
          code: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          display_name: string;
          id?: string;
          is_system?: boolean;
          owner_account_id?: string | null;
          schema_version?: number;
          template_policy?: Json;
          updated_at?: string;
          version?: number;
        };
        Update: {
          card_kind?: Database["public"]["Enums"]["card_kind"];
          code?: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          display_name?: string;
          id?: string;
          is_system?: boolean;
          owner_account_id?: string | null;
          schema_version?: number;
          template_policy?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "note_types_owner_account_id_fkey";
            columns: ["owner_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          card_payload: Json;
          content_hash: string;
          created_at: string;
          created_by: string;
          deck_id: string;
          deleted_at: string | null;
          id: string;
          metadata: Json;
          note_type_id: string;
          sort_text: string;
          source_reference: string | null;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        Insert: {
          card_payload?: Json;
          content_hash: string;
          created_at?: string;
          created_by: string;
          deck_id: string;
          deleted_at?: string | null;
          id?: string;
          metadata?: Json;
          note_type_id: string;
          sort_text?: string;
          source_reference?: string | null;
          updated_at?: string;
          updated_by: string;
          version?: number;
        };
        Update: {
          card_payload?: Json;
          content_hash?: string;
          created_at?: string;
          created_by?: string;
          deck_id?: string;
          deleted_at?: string | null;
          id?: string;
          metadata?: Json;
          note_type_id?: string;
          sort_text?: string;
          source_reference?: string | null;
          updated_at?: string;
          updated_by?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_note_type_id_fkey";
            columns: ["note_type_id"];
            isOneToOne: false;
            referencedRelation: "note_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ordering_items: {
        Row: {
          content_doc: Json;
          created_at: string;
          deleted_at: string | null;
          id: string;
          note_id: string;
          plain_text: string;
          position: number;
          semantic_key: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          content_doc: Json;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          note_id: string;
          plain_text?: string;
          position: number;
          semantic_key: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          content_doc?: Json;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          note_id?: string;
          plain_text?: string;
          position?: number;
          semantic_key?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ordering_items_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      personal_bests: {
        Row: {
          achieved_at: string;
          higher_is_better: boolean;
          learner_profile_id: string;
          metric: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          scope_hash: string;
          source_practice_session_id: string | null;
          source_test_attempt_id: string | null;
          updated_at: string;
          value: number;
        };
        Insert: {
          achieved_at: string;
          higher_is_better: boolean;
          learner_profile_id: string;
          metric: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          scope_hash: string;
          source_practice_session_id?: string | null;
          source_test_attempt_id?: string | null;
          updated_at?: string;
          value: number;
        };
        Update: {
          achieved_at?: string;
          higher_is_better?: boolean;
          learner_profile_id?: string;
          metric?: string;
          mode?: Database["public"]["Enums"]["practice_mode"];
          scope_hash?: string;
          source_practice_session_id?: string | null;
          source_test_attempt_id?: string | null;
          updated_at?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "personal_bests_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "personal_bests_source_practice_session_id_fkey";
            columns: ["source_practice_session_id"];
            isOneToOne: false;
            referencedRelation: "practice_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "personal_bests_source_test_attempt_id_fkey";
            columns: ["source_test_attempt_id"];
            isOneToOne: false;
            referencedRelation: "practice_test_attempts";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_attempts: {
        Row: {
          actor_account_id: string;
          answer_revealed: boolean;
          card_id: string;
          command_hash: string;
          confidence: number;
          content_version: number;
          correctness: number;
          created_at: string;
          device_id: string | null;
          duration_ms: number;
          explanation: string;
          hints_used: number;
          id: string;
          idempotency_key: string;
          item_position: number;
          learner_profile_id: string;
          matched_rule: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          occurred_at: string;
          practice_session_id: string;
          qualification_status: Database["public"]["Enums"]["practice_qualification_status"];
          response_hash: string | null;
          response_kind: string;
          response_text: string | null;
          retention: Database["public"]["Enums"]["answer_retention"];
          retry_count: number;
          self_confidence: number | null;
          suggested_rating: Database["public"]["Enums"]["review_rating"] | null;
          verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Insert: {
          actor_account_id: string;
          answer_revealed?: boolean;
          card_id: string;
          command_hash: string;
          confidence: number;
          content_version: number;
          correctness: number;
          created_at?: string;
          device_id?: string | null;
          duration_ms?: number;
          explanation: string;
          hints_used?: number;
          id: string;
          idempotency_key: string;
          item_position: number;
          learner_profile_id: string;
          matched_rule: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          occurred_at: string;
          practice_session_id: string;
          qualification_status?: Database["public"]["Enums"]["practice_qualification_status"];
          response_hash?: string | null;
          response_kind: string;
          response_text?: string | null;
          retention: Database["public"]["Enums"]["answer_retention"];
          retry_count?: number;
          self_confidence?: number | null;
          suggested_rating?: Database["public"]["Enums"]["review_rating"] | null;
          verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Update: {
          actor_account_id?: string;
          answer_revealed?: boolean;
          card_id?: string;
          command_hash?: string;
          confidence?: number;
          content_version?: number;
          correctness?: number;
          created_at?: string;
          device_id?: string | null;
          duration_ms?: number;
          explanation?: string;
          hints_used?: number;
          id?: string;
          idempotency_key?: string;
          item_position?: number;
          learner_profile_id?: string;
          matched_rule?: string;
          mode?: Database["public"]["Enums"]["practice_mode"];
          occurred_at?: string;
          practice_session_id?: string;
          qualification_status?: Database["public"]["Enums"]["practice_qualification_status"];
          response_hash?: string | null;
          response_kind?: string;
          response_text?: string | null;
          retention?: Database["public"]["Enums"]["answer_retention"];
          retry_count?: number;
          self_confidence?: number | null;
          suggested_rating?: Database["public"]["Enums"]["review_rating"] | null;
          verdict?: Database["public"]["Enums"]["practice_verdict"];
        };
        Relationships: [
          {
            foreignKeyName: "practice_attempts_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_attempts_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_attempts_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_attempts_item_fk";
            columns: ["practice_session_id", "item_position"];
            isOneToOne: false;
            referencedRelation: "practice_session_items";
            referencedColumns: ["practice_session_id", "position"];
          },
          {
            foreignKeyName: "practice_attempts_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_attempts_practice_session_id_fkey";
            columns: ["practice_session_id"];
            isOneToOne: false;
            referencedRelation: "practice_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_mode_preferences: {
        Row: {
          config: Json;
          config_schema_version: number;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          updated_at: string;
          version: number;
        };
        Insert: {
          config: Json;
          config_schema_version?: number;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          config?: Json;
          config_schema_version?: number;
          learner_profile_id?: string;
          mode?: Database["public"]["Enums"]["practice_mode"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "practice_mode_preferences_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_session_items: {
        Row: {
          attempt_count: number;
          card_id: string;
          completed_at: string | null;
          position: number;
          practice_session_id: string;
          question_kind: string;
          question_level: string;
          seed_fragment: string;
          shown_at: string | null;
          status: Database["public"]["Enums"]["practice_item_status"];
        };
        Insert: {
          attempt_count?: number;
          card_id: string;
          completed_at?: string | null;
          position: number;
          practice_session_id: string;
          question_kind: string;
          question_level: string;
          seed_fragment: string;
          shown_at?: string | null;
          status?: Database["public"]["Enums"]["practice_item_status"];
        };
        Update: {
          attempt_count?: number;
          card_id?: string;
          completed_at?: string | null;
          position?: number;
          practice_session_id?: string;
          question_kind?: string;
          question_level?: string;
          seed_fragment?: string;
          shown_at?: string | null;
          status?: Database["public"]["Enums"]["practice_item_status"];
        };
        Relationships: [
          {
            foreignKeyName: "practice_session_items_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_session_items_practice_session_id_fkey";
            columns: ["practice_session_id"];
            isOneToOne: false;
            referencedRelation: "practice_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_sessions: {
        Row: {
          actor_account_id: string;
          command_hash: string;
          completed_at: string | null;
          completed_items: number;
          config: Json;
          config_schema_version: number;
          id: string;
          last_activity_at: string;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          queue_seed: string;
          scope: Json;
          started_at: string;
          status: Database["public"]["Enums"]["practice_session_status"];
          total_items: number;
          version: number;
        };
        Insert: {
          actor_account_id: string;
          command_hash: string;
          completed_at?: string | null;
          completed_items?: number;
          config?: Json;
          config_schema_version?: number;
          id: string;
          last_activity_at?: string;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["practice_mode"];
          queue_seed: string;
          scope?: Json;
          started_at?: string;
          status?: Database["public"]["Enums"]["practice_session_status"];
          total_items?: number;
          version?: number;
        };
        Update: {
          actor_account_id?: string;
          command_hash?: string;
          completed_at?: string | null;
          completed_items?: number;
          config?: Json;
          config_schema_version?: number;
          id?: string;
          last_activity_at?: string;
          learner_profile_id?: string;
          mode?: Database["public"]["Enums"]["practice_mode"];
          queue_seed?: string;
          scope?: Json;
          started_at?: string;
          status?: Database["public"]["Enums"]["practice_session_status"];
          total_items?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "practice_sessions_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_sessions_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_srs_qualifications: {
        Row: {
          actor_account_id: string;
          created_at: string;
          explicitly_accepted_at: string;
          id: string;
          learner_profile_id: string;
          practice_attempt_id: string;
          review_log_id: string;
          selected_rating: Database["public"]["Enums"]["review_rating"];
          suggested_rating: Database["public"]["Enums"]["review_rating"];
        };
        Insert: {
          actor_account_id: string;
          created_at?: string;
          explicitly_accepted_at: string;
          id: string;
          learner_profile_id: string;
          practice_attempt_id: string;
          review_log_id: string;
          selected_rating: Database["public"]["Enums"]["review_rating"];
          suggested_rating: Database["public"]["Enums"]["review_rating"];
        };
        Update: {
          actor_account_id?: string;
          created_at?: string;
          explicitly_accepted_at?: string;
          id?: string;
          learner_profile_id?: string;
          practice_attempt_id?: string;
          review_log_id?: string;
          selected_rating?: Database["public"]["Enums"]["review_rating"];
          suggested_rating?: Database["public"]["Enums"]["review_rating"];
        };
        Relationships: [
          {
            foreignKeyName: "practice_srs_qualifications_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_srs_qualifications_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_srs_qualifications_practice_attempt_id_fkey";
            columns: ["practice_attempt_id"];
            isOneToOne: true;
            referencedRelation: "practice_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_srs_qualifications_review_log_id_fkey";
            columns: ["review_log_id"];
            isOneToOne: true;
            referencedRelation: "review_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_test_attempts: {
        Row: {
          actor_account_id: string;
          answered_count: number;
          available_points: number;
          awarded_points: number;
          completed_at: string | null;
          definition_id: string;
          id: string;
          learner_profile_id: string;
          practice_session_id: string | null;
          question_count: number;
          seed: string;
          started_at: string;
          status: Database["public"]["Enums"]["practice_test_status"];
        };
        Insert: {
          actor_account_id: string;
          answered_count?: number;
          available_points: number;
          awarded_points?: number;
          completed_at?: string | null;
          definition_id: string;
          id: string;
          learner_profile_id: string;
          practice_session_id?: string | null;
          question_count: number;
          seed: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["practice_test_status"];
        };
        Update: {
          actor_account_id?: string;
          answered_count?: number;
          available_points?: number;
          awarded_points?: number;
          completed_at?: string | null;
          definition_id?: string;
          id?: string;
          learner_profile_id?: string;
          practice_session_id?: string | null;
          question_count?: number;
          seed?: string;
          started_at?: string;
          status?: Database["public"]["Enums"]["practice_test_status"];
        };
        Relationships: [
          {
            foreignKeyName: "practice_test_attempts_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_test_attempts_definition_id_fkey";
            columns: ["definition_id"];
            isOneToOne: false;
            referencedRelation: "practice_test_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_test_attempts_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_test_attempts_practice_session_id_fkey";
            columns: ["practice_session_id"];
            isOneToOne: false;
            referencedRelation: "practice_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_test_definitions: {
        Row: {
          actor_account_id: string;
          config: Json;
          config_schema_version: number;
          created_at: string;
          deleted_at: string | null;
          id: string;
          learner_profile_id: string;
          name: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          actor_account_id: string;
          config: Json;
          config_schema_version?: number;
          created_at?: string;
          deleted_at?: string | null;
          id: string;
          learner_profile_id: string;
          name: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          actor_account_id?: string;
          config?: Json;
          config_schema_version?: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          learner_profile_id?: string;
          name?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "practice_test_definitions_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_test_definitions_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_test_responses: {
        Row: {
          available_points: number;
          awarded_points: number;
          card_id: string;
          created_at: string;
          id: string;
          learner_profile_id: string;
          position: number;
          practice_attempt_id: string | null;
          practice_test_attempt_id: string;
          question_kind: string;
          verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Insert: {
          available_points: number;
          awarded_points: number;
          card_id: string;
          created_at?: string;
          id: string;
          learner_profile_id: string;
          position: number;
          practice_attempt_id?: string | null;
          practice_test_attempt_id: string;
          question_kind: string;
          verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Update: {
          available_points?: number;
          awarded_points?: number;
          card_id?: string;
          created_at?: string;
          id?: string;
          learner_profile_id?: string;
          position?: number;
          practice_attempt_id?: string | null;
          practice_test_attempt_id?: string;
          question_kind?: string;
          verdict?: Database["public"]["Enums"]["practice_verdict"];
        };
        Relationships: [
          {
            foreignKeyName: "practice_test_responses_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_test_responses_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_test_responses_practice_attempt_id_fkey";
            columns: ["practice_attempt_id"];
            isOneToOne: false;
            referencedRelation: "practice_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_test_responses_practice_test_attempt_id_fkey";
            columns: ["practice_test_attempt_id"];
            isOneToOne: false;
            referencedRelation: "practice_test_attempts";
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
      product_guide_progress: {
        Row: {
          account_id: string;
          completed_at: string | null;
          created_at: string;
          current_step: number;
          dismissed_at: string | null;
          guide_key: string;
          guide_version: number;
          id: string;
          last_seen_at: string;
          learner_profile_id: string | null;
          metadata: Json;
          metadata_schema_version: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["product_guide_status"];
          updated_at: string;
        };
        Insert: {
          account_id: string;
          completed_at?: string | null;
          created_at?: string;
          current_step?: number;
          dismissed_at?: string | null;
          guide_key: string;
          guide_version: number;
          id: string;
          last_seen_at?: string;
          learner_profile_id?: string | null;
          metadata?: Json;
          metadata_schema_version?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["product_guide_status"];
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          completed_at?: string | null;
          created_at?: string;
          current_step?: number;
          dismissed_at?: string | null;
          guide_key?: string;
          guide_version?: number;
          id?: string;
          last_seen_at?: string;
          learner_profile_id?: string | null;
          metadata?: Json;
          metadata_schema_version?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["product_guide_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_guide_progress_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_guide_progress_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
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
      pronunciation_prompts: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          fallback_answer: string | null;
          language: string;
          note_id: string;
          reference_asset_id: string | null;
          text: string;
          tts_allowed: boolean;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          fallback_answer?: string | null;
          language: string;
          note_id: string;
          reference_asset_id?: string | null;
          text: string;
          tts_allowed?: boolean;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          fallback_answer?: string | null;
          language?: string;
          note_id?: string;
          reference_asset_id?: string | null;
          text?: string;
          tts_allowed?: boolean;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pronunciation_prompts_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: true;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pronunciation_prompts_reference_asset_id_fkey";
            columns: ["reference_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      review_logs: {
        Row: {
          actor_account_id: string;
          card_id: string;
          command_hash: string;
          content_version: number;
          created_at: string;
          deck_id: string;
          device_id: string | null;
          duration_ms: number;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          preset_id: string;
          preset_version: number;
          rating: Database["public"]["Enums"]["review_rating"];
          reviewed_at: string;
          schedule_after: Json;
          schedule_before: Json;
          schedule_version_after: number;
          schedule_version_before: number;
          scheduler_version: string;
          source: Database["public"]["Enums"]["review_source"];
          study_day: string;
          study_day_start: number;
          study_session_id: string | null;
          timezone: string;
        };
        Insert: {
          actor_account_id: string;
          card_id: string;
          command_hash: string;
          content_version: number;
          created_at?: string;
          deck_id: string;
          device_id?: string | null;
          duration_ms: number;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          preset_id: string;
          preset_version: number;
          rating: Database["public"]["Enums"]["review_rating"];
          reviewed_at: string;
          schedule_after: Json;
          schedule_before: Json;
          schedule_version_after: number;
          schedule_version_before: number;
          scheduler_version: string;
          source: Database["public"]["Enums"]["review_source"];
          study_day: string;
          study_day_start: number;
          study_session_id?: string | null;
          timezone: string;
        };
        Update: {
          actor_account_id?: string;
          card_id?: string;
          command_hash?: string;
          content_version?: number;
          created_at?: string;
          deck_id?: string;
          device_id?: string | null;
          duration_ms?: number;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
          preset_id?: string;
          preset_version?: number;
          rating?: Database["public"]["Enums"]["review_rating"];
          reviewed_at?: string;
          schedule_after?: Json;
          schedule_before?: Json;
          schedule_version_after?: number;
          schedule_version_before?: number;
          scheduler_version?: string;
          source?: Database["public"]["Enums"]["review_source"];
          study_day?: string;
          study_day_start?: number;
          study_session_id?: string | null;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_logs_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_logs_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_logs_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_logs_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_logs_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_logs_preset_id_fkey";
            columns: ["preset_id"];
            isOneToOne: false;
            referencedRelation: "srs_presets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_logs_study_session_id_fkey";
            columns: ["study_session_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      review_undo_events: {
        Row: {
          actor_account_id: string;
          created_at: string;
          device_id: string | null;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          reason: string | null;
          restored_schedule: Json;
          review_log_id: string;
          schedule_version_after: number;
          schedule_version_before: number;
        };
        Insert: {
          actor_account_id: string;
          created_at?: string;
          device_id?: string | null;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          reason?: string | null;
          restored_schedule: Json;
          review_log_id: string;
          schedule_version_after: number;
          schedule_version_before: number;
        };
        Update: {
          actor_account_id?: string;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
          reason?: string | null;
          restored_schedule?: Json;
          review_log_id?: string;
          schedule_version_after?: number;
          schedule_version_before?: number;
        };
        Relationships: [
          {
            foreignKeyName: "review_undo_events_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_undo_events_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_undo_events_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_undo_events_review_log_id_fkey";
            columns: ["review_log_id"];
            isOneToOne: false;
            referencedRelation: "review_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_operation_events: {
        Row: {
          actor_account_id: string;
          affected_count: number;
          after_state: Json;
          before_state: Json;
          card_id: string | null;
          created_at: string;
          device_id: string | null;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          operation: Database["public"]["Enums"]["schedule_operation_kind"];
        };
        Insert: {
          actor_account_id: string;
          affected_count: number;
          after_state: Json;
          before_state: Json;
          card_id?: string | null;
          created_at?: string;
          device_id?: string | null;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          operation: Database["public"]["Enums"]["schedule_operation_kind"];
        };
        Update: {
          actor_account_id?: string;
          affected_count?: number;
          after_state?: Json;
          before_state?: Json;
          card_id?: string | null;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
          operation?: Database["public"]["Enums"]["schedule_operation_kind"];
        };
        Relationships: [
          {
            foreignKeyName: "schedule_operation_events_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_operation_events_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_operation_events_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_operation_events_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_snapshots: {
        Row: {
          card_id: string;
          created_at: string;
          id: string;
          learner_profile_id: string;
          reason: string;
          review_log_id: string | null;
          schedule: Json;
          schedule_version: number;
        };
        Insert: {
          card_id: string;
          created_at?: string;
          id?: string;
          learner_profile_id: string;
          reason: string;
          review_log_id?: string | null;
          schedule: Json;
          schedule_version: number;
        };
        Update: {
          card_id?: string;
          created_at?: string;
          id?: string;
          learner_profile_id?: string;
          reason?: string;
          review_log_id?: string | null;
          schedule?: Json;
          schedule_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_snapshots_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_snapshots_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_snapshots_review_log_id_fkey";
            columns: ["review_log_id"];
            isOneToOne: false;
            referencedRelation: "review_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      source_references: {
        Row: {
          author: string | null;
          citation_doc: Json;
          created_at: string;
          deleted_at: string | null;
          id: string;
          note_id: string;
          position: number;
          semantic_key: string;
          title: string | null;
          updated_at: string;
          url: string | null;
          version: number;
        };
        Insert: {
          author?: string | null;
          citation_doc: Json;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          note_id: string;
          position?: number;
          semantic_key: string;
          title?: string | null;
          updated_at?: string;
          url?: string | null;
          version?: number;
        };
        Update: {
          author?: string | null;
          citation_doc?: Json;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          note_id?: string;
          position?: number;
          semantic_key?: string;
          title?: string | null;
          updated_at?: string;
          url?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "source_references_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      srs_optimization_jobs: {
        Row: {
          confirmed_at: string | null;
          created_at: string;
          error_code: string | null;
          id: string;
          idempotency_key: string;
          input_schema_version: string;
          learner_profile_id: string;
          preset_id: string;
          previous_parameters: Json;
          proposed_parameters: Json | null;
          result_summary: Json | null;
          rolled_back_at: string | null;
          source_review_count: number;
          status: Database["public"]["Enums"]["srs_optimization_status"];
          updated_at: string;
        };
        Insert: {
          confirmed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          id: string;
          idempotency_key: string;
          input_schema_version?: string;
          learner_profile_id: string;
          preset_id: string;
          previous_parameters: Json;
          proposed_parameters?: Json | null;
          result_summary?: Json | null;
          rolled_back_at?: string | null;
          source_review_count: number;
          status?: Database["public"]["Enums"]["srs_optimization_status"];
          updated_at?: string;
        };
        Update: {
          confirmed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string;
          input_schema_version?: string;
          learner_profile_id?: string;
          preset_id?: string;
          previous_parameters?: Json;
          proposed_parameters?: Json | null;
          result_summary?: Json | null;
          rolled_back_at?: string | null;
          source_review_count?: number;
          status?: Database["public"]["Enums"]["srs_optimization_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "srs_optimization_jobs_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "srs_optimization_jobs_preset_id_fkey";
            columns: ["preset_id"];
            isOneToOne: false;
            referencedRelation: "srs_presets";
            referencedColumns: ["id"];
          },
        ];
      };
      srs_preset_versions: {
        Row: {
          created_at: string;
          learner_profile_id: string;
          preset_id: string;
          snapshot: Json;
          version: number;
        };
        Insert: {
          created_at?: string;
          learner_profile_id: string;
          preset_id: string;
          snapshot: Json;
          version: number;
        };
        Update: {
          created_at?: string;
          learner_profile_id?: string;
          preset_id?: string;
          snapshot?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "srs_preset_versions_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "srs_preset_versions_preset_id_fkey";
            columns: ["preset_id"];
            isOneToOne: false;
            referencedRelation: "srs_presets";
            referencedColumns: ["id"];
          },
        ];
      };
      srs_presets: {
        Row: {
          algorithm: Database["public"]["Enums"]["srs_algorithm"];
          bury_siblings: boolean;
          created_at: string;
          deleted_at: string | null;
          fsrs_weights: Json | null;
          fuzz_enabled: boolean;
          id: string;
          is_default: boolean;
          learner_profile_id: string;
          learning_steps_minutes: number[];
          leech_action: Database["public"]["Enums"]["srs_leech_action"];
          leech_threshold: number;
          maximum_interval_days: number;
          name: string;
          new_card_order: Database["public"]["Enums"]["new_card_order"];
          new_cards_per_day: number;
          new_review_mix: Database["public"]["Enums"]["new_review_mix"];
          relearning_steps_minutes: number[];
          requested_retention: number;
          review_order: Database["public"]["Enums"]["review_card_order"];
          reviews_per_day: number;
          short_term_enabled: boolean;
          updated_at: string;
          version: number;
        };
        Insert: {
          algorithm?: Database["public"]["Enums"]["srs_algorithm"];
          bury_siblings?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          fsrs_weights?: Json | null;
          fuzz_enabled?: boolean;
          id?: string;
          is_default?: boolean;
          learner_profile_id: string;
          learning_steps_minutes?: number[];
          leech_action?: Database["public"]["Enums"]["srs_leech_action"];
          leech_threshold?: number;
          maximum_interval_days?: number;
          name: string;
          new_card_order?: Database["public"]["Enums"]["new_card_order"];
          new_cards_per_day?: number;
          new_review_mix?: Database["public"]["Enums"]["new_review_mix"];
          relearning_steps_minutes?: number[];
          requested_retention?: number;
          review_order?: Database["public"]["Enums"]["review_card_order"];
          reviews_per_day?: number;
          short_term_enabled?: boolean;
          updated_at?: string;
          version?: number;
        };
        Update: {
          algorithm?: Database["public"]["Enums"]["srs_algorithm"];
          bury_siblings?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          fsrs_weights?: Json | null;
          fuzz_enabled?: boolean;
          id?: string;
          is_default?: boolean;
          learner_profile_id?: string;
          learning_steps_minutes?: number[];
          leech_action?: Database["public"]["Enums"]["srs_leech_action"];
          leech_threshold?: number;
          maximum_interval_days?: number;
          name?: string;
          new_card_order?: Database["public"]["Enums"]["new_card_order"];
          new_cards_per_day?: number;
          new_review_mix?: Database["public"]["Enums"]["new_review_mix"];
          relearning_steps_minutes?: number[];
          requested_retention?: number;
          review_order?: Database["public"]["Enums"]["review_card_order"];
          reviews_per_day?: number;
          short_term_enabled?: boolean;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "srs_presets_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      study_content_reports: {
        Row: {
          card_id: string;
          content_version: number;
          created_at: string;
          deck_id: string;
          details: string | null;
          device_id: string | null;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          reason: Database["public"]["Enums"]["study_content_report_reason"];
          reporter_account_id: string;
        };
        Insert: {
          card_id: string;
          content_version: number;
          created_at?: string;
          deck_id: string;
          details?: string | null;
          device_id?: string | null;
          id: string;
          idempotency_key: string;
          learner_profile_id: string;
          reason: Database["public"]["Enums"]["study_content_report_reason"];
          reporter_account_id: string;
        };
        Update: {
          card_id?: string;
          content_version?: number;
          created_at?: string;
          deck_id?: string;
          details?: string | null;
          device_id?: string | null;
          id?: string;
          idempotency_key?: string;
          learner_profile_id?: string;
          reason?: Database["public"]["Enums"]["study_content_report_reason"];
          reporter_account_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_content_reports_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_content_reports_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_content_reports_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_content_reports_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_content_reports_reporter_account_id_fkey";
            columns: ["reporter_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      study_filters: {
        Row: {
          created_at: string;
          definition: Json;
          deleted_at: string | null;
          id: string;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["study_session_mode"];
          name: string;
          rescheduling: boolean;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          definition?: Json;
          deleted_at?: string | null;
          id?: string;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["study_session_mode"];
          name: string;
          rescheduling?: boolean;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          definition?: Json;
          deleted_at?: string | null;
          id?: string;
          learner_profile_id?: string;
          mode?: Database["public"]["Enums"]["study_session_mode"];
          name?: string;
          rescheduling?: boolean;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "study_filters_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      study_session_events: {
        Row: {
          action: string;
          actor_account_id: string;
          card_id: string | null;
          created_at: string;
          id: string;
          learner_profile_id: string;
          study_session_id: string;
        };
        Insert: {
          action: string;
          actor_account_id: string;
          card_id?: string | null;
          created_at?: string;
          id: string;
          learner_profile_id: string;
          study_session_id: string;
        };
        Update: {
          action?: string;
          actor_account_id?: string;
          card_id?: string | null;
          created_at?: string;
          id?: string;
          learner_profile_id?: string;
          study_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_session_events_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_session_events_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_session_events_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_session_events_study_session_id_fkey";
            columns: ["study_session_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      study_session_items: {
        Row: {
          card_id: string;
          completed_at: string | null;
          position: number;
          review_log_id: string | null;
          schedule_version_at_enqueue: number;
          shown_at: string | null;
          state_at_enqueue: Database["public"]["Enums"]["srs_state"];
          status: Database["public"]["Enums"]["study_session_item_status"];
          study_session_id: string;
        };
        Insert: {
          card_id: string;
          completed_at?: string | null;
          position: number;
          review_log_id?: string | null;
          schedule_version_at_enqueue: number;
          shown_at?: string | null;
          state_at_enqueue: Database["public"]["Enums"]["srs_state"];
          status?: Database["public"]["Enums"]["study_session_item_status"];
          study_session_id: string;
        };
        Update: {
          card_id?: string;
          completed_at?: string | null;
          position?: number;
          review_log_id?: string | null;
          schedule_version_at_enqueue?: number;
          shown_at?: string | null;
          state_at_enqueue?: Database["public"]["Enums"]["srs_state"];
          status?: Database["public"]["Enums"]["study_session_item_status"];
          study_session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_session_items_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_session_items_review_log_fk";
            columns: ["review_log_id"];
            isOneToOne: false;
            referencedRelation: "review_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_session_items_study_session_id_fkey";
            columns: ["study_session_id"];
            isOneToOne: false;
            referencedRelation: "study_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      study_sessions: {
        Row: {
          actor_account_id: string;
          completed_at: string | null;
          completed_items: number;
          deck_id: string | null;
          filter_id: string | null;
          id: string;
          last_activity_at: string;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["study_session_mode"];
          queue_seed: string;
          rescheduling: boolean;
          source: Database["public"]["Enums"]["review_source"];
          started_at: string;
          status: Database["public"]["Enums"]["study_session_status"];
          study_day: string;
          study_day_start: number;
          timezone: string;
          total_items: number;
          version: number;
        };
        Insert: {
          actor_account_id: string;
          completed_at?: string | null;
          completed_items?: number;
          deck_id?: string | null;
          filter_id?: string | null;
          id: string;
          last_activity_at?: string;
          learner_profile_id: string;
          mode: Database["public"]["Enums"]["study_session_mode"];
          queue_seed: string;
          rescheduling: boolean;
          source: Database["public"]["Enums"]["review_source"];
          started_at?: string;
          status?: Database["public"]["Enums"]["study_session_status"];
          study_day: string;
          study_day_start: number;
          timezone: string;
          total_items?: number;
          version?: number;
        };
        Update: {
          actor_account_id?: string;
          completed_at?: string | null;
          completed_items?: number;
          deck_id?: string | null;
          filter_id?: string | null;
          id?: string;
          last_activity_at?: string;
          learner_profile_id?: string;
          mode?: Database["public"]["Enums"]["study_session_mode"];
          queue_seed?: string;
          rescheduling?: boolean;
          source?: Database["public"]["Enums"]["review_source"];
          started_at?: string;
          status?: Database["public"]["Enums"]["study_session_status"];
          study_day?: string;
          study_day_start?: number;
          timezone?: string;
          total_items?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "study_sessions_actor_account_id_fkey";
            columns: ["actor_account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_sessions_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_sessions_filter_id_fkey";
            columns: ["filter_id"];
            isOneToOne: false;
            referencedRelation: "study_filters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "study_sessions_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_device_state: {
        Row: {
          account_id: string;
          created_at: string;
          device_id: string;
          last_cursor: number;
          last_seen_at: string;
          last_successful_sync_at: string | null;
          learner_profile_id: string;
          media_download_preference: string;
          metered_connection_preference: string;
          protocol_version: number;
          synchronization_paused: boolean;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          device_id: string;
          last_cursor?: number;
          last_seen_at?: string;
          last_successful_sync_at?: string | null;
          learner_profile_id: string;
          media_download_preference?: string;
          metered_connection_preference?: string;
          protocol_version?: number;
          synchronization_paused?: boolean;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          device_id?: string;
          last_cursor?: number;
          last_seen_at?: string;
          last_successful_sync_at?: string | null;
          learner_profile_id?: string;
          media_download_preference?: string;
          metered_connection_preference?: string;
          protocol_version?: number;
          synchronization_paused?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_device_state_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_device_state_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_device_state_learner_profile_id_fkey";
            columns: ["learner_profile_id"];
            isOneToOne: false;
            referencedRelation: "learner_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          color: string | null;
          created_at: string;
          deck_id: string;
          deleted_at: string | null;
          id: string;
          name: string;
          normalized_name: string;
          parent_tag_id: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          deck_id: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          normalized_name: string;
          parent_tag_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          deck_id?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          normalized_name?: string;
          parent_tag_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tags_deck_id_fkey";
            columns: ["deck_id"];
            isOneToOne: false;
            referencedRelation: "decks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tags_parent_tag_id_fkey";
            columns: ["parent_tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      published_cards: {
        Row: {
          back_template: string | null;
          card_kind: Database["public"]["Enums"]["card_kind"] | null;
          card_payload: Json | null;
          card_public_id: string | null;
          content_hash: string | null;
          deck_public_id: string | null;
          field_values: Json | null;
          front_template: string | null;
          generation_key: string | null;
          ordinal: number | null;
          published_at: string | null;
          source_references: Json | null;
          styling_css: string | null;
          template_key: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "card_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "deck_publications";
            referencedColumns: ["public_id"];
          },
          {
            foreignKeyName: "card_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "published_decks";
            referencedColumns: ["public_id"];
          },
        ];
      };
      published_decks: {
        Row: {
          card_count: number | null;
          card_kinds: Database["public"]["Enums"]["card_kind"][] | null;
          content_hash: string | null;
          cover_media_public_id: string | null;
          creator_display_name: string | null;
          creator_handle: string | null;
          description_doc: Json | null;
          description_plain: string | null;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"] | null;
          public_id: string | null;
          published_at: string | null;
          published_version: number | null;
          slug: string | null;
          theme: string | null;
          title: string | null;
          updated_at: string | null;
        };
        Insert: {
          card_count?: number | null;
          card_kinds?: Database["public"]["Enums"]["card_kind"][] | null;
          content_hash?: string | null;
          cover_media_public_id?: string | null;
          creator_display_name?: string | null;
          creator_handle?: string | null;
          description_doc?: Json | null;
          description_plain?: string | null;
          language_back?: string | null;
          language_front?: string | null;
          license?: Database["public"]["Enums"]["deck_license"] | null;
          public_id?: string | null;
          published_at?: string | null;
          published_version?: number | null;
          slug?: string | null;
          theme?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Update: {
          card_count?: number | null;
          card_kinds?: Database["public"]["Enums"]["card_kind"][] | null;
          content_hash?: string | null;
          cover_media_public_id?: string | null;
          creator_display_name?: string | null;
          creator_handle?: string | null;
          description_doc?: Json | null;
          description_plain?: string | null;
          language_back?: string | null;
          language_front?: string | null;
          license?: Database["public"]["Enums"]["deck_license"] | null;
          public_id?: string | null;
          published_at?: string | null;
          published_version?: number | null;
          slug?: string | null;
          theme?: string | null;
          title?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      published_media: {
        Row: {
          alt_text: string | null;
          byte_size: number | null;
          deck_public_id: string | null;
          duration_ms: number | null;
          height: number | null;
          kind: Database["public"]["Enums"]["media_kind"] | null;
          media_public_id: string | null;
          mime_type: string | null;
          published_at: string | null;
          width: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "deck_publications";
            referencedColumns: ["public_id"];
          },
          {
            foreignKeyName: "media_publications_deck_public_id_fkey";
            columns: ["deck_public_id"];
            isOneToOne: false;
            referencedRelation: "published_decks";
            referencedColumns: ["public_id"];
          },
        ];
      };
    };
    Functions: {
      admin_abandon_media_asset_upload: {
        Args: {
          p_actor_account_id: string;
          p_idempotency_key: string;
          p_media_asset_id: string;
        };
        Returns: {
          alt_text: string | null;
          byte_size: number;
          created_at: string;
          delete_after: string | null;
          deleted_at: string | null;
          detected_mime_type: string | null;
          duration_ms: number | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          magic_verified: boolean;
          metadata: Json;
          mime_type: string;
          owner_account_id: string;
          public_id: string;
          reference_count: number;
          sha256: string;
          status: Database["public"]["Enums"]["media_status"];
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          version: number;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_apply_content_change_schedule_decision: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id: string;
          p_choice: Database["public"]["Enums"]["content_change_resolution"];
          p_device_id: string;
          p_expected_schedule_version: number;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_operation_event_id: string;
          p_profile_session_id: string;
          p_schedule_after: Json;
          p_scheduler_version: string;
        };
        Returns: Json;
      };
      admin_apply_srs_preset_to_decks: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_deck_ids: string[];
          p_device_id: string;
          p_learner_profile_id: string;
          p_preset_id: string;
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_begin_portability_job: {
        Args: {
          p_job_id: string;
          p_job_kind: Database["public"]["Enums"]["portability_job_kind"];
          p_lease_seconds?: number;
          p_worker_id: string;
        };
        Returns: string;
      };
      admin_begin_sync_operation: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_operation_id: string;
          p_operation_kind: string;
          p_payload_fingerprint: string;
          p_profile_session_id: string;
          p_protocol_version: number;
        };
        Returns: Json;
      };
      admin_bulk_srs_schedule_control: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_deck_ids: string[];
          p_device_id: string;
          p_effective_at: string;
          p_expected_count: number;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_operation: Database["public"]["Enums"]["schedule_operation_kind"];
          p_operation_event_id: string;
          p_preview: boolean;
          p_profile_session_id: string;
          p_value: Json;
        };
        Returns: Json;
      };
      admin_bury_srs_siblings: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_buried_until: string;
          p_card_id: string;
          p_device_id: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_operation_event_id: string;
          p_profile_session_id: string;
          p_scheduler_version: string;
        };
        Returns: Json;
      };
      admin_cancel_account_deletion: {
        Args: {
          p_actor_account_id: string;
          p_deletion_job_id: string;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      admin_checkpoint_portability_job: {
        Args: {
          p_checkpoint_key: string;
          p_checkpoint_ordinal: number;
          p_error_count: number;
          p_job_id: string;
          p_job_kind: Database["public"]["Enums"]["portability_job_kind"];
          p_lease_token: string;
          p_payload_fingerprint: string;
          p_phase: string;
          p_processed_count: number;
          p_result_summary?: Json;
          p_total_count: number;
          p_warning_count: number;
        };
        Returns: Json;
      };
      admin_claim_due_media_deletions: {
        Args: { p_lease_seconds?: number; p_limit: number; p_worker_id: string };
        Returns: {
          lease_token: string;
          media_asset_id: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      admin_claim_portability_jobs: {
        Args: {
          p_lease_seconds?: number;
          p_limit?: number;
          p_worker_id: string;
        };
        Returns: {
          attempt_number: number;
          job_id: string;
          job_kind: Database["public"]["Enums"]["portability_job_kind"];
          lease_token: string;
          phase: string;
          queue_id: string;
        }[];
      };
      admin_claim_portability_object_cleanup: {
        Args: { p_limit?: number };
        Returns: {
          object_id: string;
          object_kind: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      admin_commit_srs_algorithm_migration: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_deck_ids: string[];
          p_device_id: string;
          p_expected_count: number;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_operation_event_id: string;
          p_profile_session_id: string;
          p_target_preset_id: string;
          p_transitions: Json;
        };
        Returns: Json;
      };
      admin_commit_srs_review: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id: string;
          p_command_hash: string;
          p_current_schedule_version: number;
          p_device_id: string;
          p_duration_ms: number;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_preset_id: string;
          p_preset_version: number;
          p_profile_session_id: string;
          p_rating: Database["public"]["Enums"]["review_rating"];
          p_review_id: string;
          p_reviewed_at: string;
          p_schedule_after: Json;
          p_schedule_before: Json;
          p_scheduler_version: string;
          p_source: Database["public"]["Enums"]["review_source"];
          p_study_day_start: number;
          p_study_session_id: string;
          p_timezone: string;
        };
        Returns: Json;
      };
      admin_commit_srs_review_v2: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id: string;
          p_command_hash: string;
          p_current_schedule_version: number;
          p_device_id: string;
          p_duration_ms: number;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_preset_id: string;
          p_preset_version: number;
          p_profile_session_id: string;
          p_rating: Database["public"]["Enums"]["review_rating"];
          p_request_hash: string;
          p_review_id: string;
          p_reviewed_at: string;
          p_schedule_after: Json;
          p_schedule_before: Json;
          p_scheduler_version: string;
          p_source: Database["public"]["Enums"]["review_source"];
          p_study_day_start: number;
          p_study_session_id: string;
          p_timezone: string;
        };
        Returns: Json;
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
      admin_complete_media_deletion: {
        Args: {
          p_error?: string;
          p_lease_token: string;
          p_media_asset_id: string;
          p_succeeded: boolean;
        };
        Returns: Json;
      };
      admin_complete_portability_job: {
        Args: {
          p_error_count: number;
          p_job_id: string;
          p_job_kind: Database["public"]["Enums"]["portability_job_kind"];
          p_lease_token: string;
          p_result: Database["public"]["Enums"]["portability_job_status"];
          p_safe_error_code?: string;
          p_safe_error_summary?: string;
          p_warning_count: number;
        };
        Returns: Json;
      };
      admin_complete_sync_operation: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_entity_id: string;
          p_entity_type: string;
          p_entity_version: number;
          p_learner_profile_id: string;
          p_operation_id: string;
          p_payload_fingerprint: string;
          p_profile_session_id: string;
          p_result: Json;
          p_tombstone?: boolean;
        };
        Returns: Json;
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
      admin_confirm_portability_object_deleted: {
        Args: { p_object_id: string; p_object_kind: string };
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
      admin_control_practice_session: {
        Args: {
          p_action: string;
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_expected_version: number;
          p_learner_profile_id: string;
          p_practice_session_id: string;
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_control_study_session: {
        Args: {
          p_action: string;
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id?: string;
          p_device_id: string;
          p_event_id: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_study_session_id: string;
        };
        Returns: Json;
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
      admin_create_practice_session: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_command_hash: string;
          p_config: Json;
          p_config_schema_version: number;
          p_device_id: string;
          p_items: Json;
          p_learner_profile_id: string;
          p_mode: Database["public"]["Enums"]["practice_mode"];
          p_practice_session_id: string;
          p_profile_session_id: string;
          p_queue_seed: string;
          p_scope: Json;
          p_started_at: string;
        };
        Returns: Json;
      };
      admin_create_practice_test_attempt: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_available_points: number;
          p_definition_id: string;
          p_device_id: string;
          p_learner_profile_id: string;
          p_practice_session_id: string;
          p_profile_session_id: string;
          p_question_count: number;
          p_seed: string;
          p_started_at: string;
          p_test_attempt_id: string;
        };
        Returns: Json;
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
      admin_create_study_session: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_deck_id: string;
          p_device_id: string;
          p_filter_id: string;
          p_items: Json;
          p_learner_profile_id: string;
          p_mode: Database["public"]["Enums"]["study_session_mode"];
          p_profile_session_id: string;
          p_queue_seed: string;
          p_rescheduling: boolean;
          p_source: Database["public"]["Enums"]["review_source"];
          p_started_at: string;
          p_study_day_start: number;
          p_study_session_id: string;
          p_timezone: string;
        };
        Returns: Json;
      };
      admin_delete_portability_artifact: {
        Args: { p_account_id: string; p_artifact_id: string };
        Returns: {
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      admin_delete_srs_preset: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_expected_version: number;
          p_learner_profile_id: string;
          p_preset_id: string;
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_delete_study_filter: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_expected_version: number;
          p_filter_id: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_ensure_account: {
        Args: { p_actor_account_id: string };
        Returns: string;
      };
      admin_expire_portability_objects: {
        Args: { p_limit?: number };
        Returns: {
          object_id: string;
          object_kind: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      admin_finalize_media_asset: {
        Args: {
          p_actor_account_id: string;
          p_detected_mime_type: string;
          p_detected_sha256: string;
          p_idempotency_key: string;
          p_magic_verified: boolean;
          p_media_asset_id: string;
        };
        Returns: {
          alt_text: string | null;
          byte_size: number;
          created_at: string;
          delete_after: string | null;
          deleted_at: string | null;
          detected_mime_type: string | null;
          duration_ms: number | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          magic_verified: boolean;
          metadata: Json;
          mime_type: string;
          owner_account_id: string;
          public_id: string;
          reference_count: number;
          sha256: string;
          status: Database["public"]["Enums"]["media_status"];
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          version: number;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      admin_get_portability_artifact_object: {
        Args: { p_account_id: string; p_artifact_id: string };
        Returns: {
          byte_size: number;
          display_name: string;
          mime_type: string;
          sha256: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      admin_get_portability_audit_events: {
        Args: { p_account_id: string };
        Returns: Json;
      };
      admin_get_portability_card_id_map: {
        Args: { p_account_id: string; p_import_job_id: string };
        Returns: Json;
      };
      admin_get_portability_upload_object: {
        Args: { p_account_id: string; p_import_job_id: string };
        Returns: {
          byte_size: number;
          declared_mime_type: string;
          detected_mime_type: string;
          sha256: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      admin_get_public_deck_media_storage: {
        Args: { p_public_id: string };
        Returns: {
          media_public_id: string;
          storage_bucket: string;
          storage_path: string;
        }[];
      };
      admin_get_srs_algorithm_migration_context: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_deck_ids: string[];
          p_device_id: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_target_preset_id: string;
        };
        Returns: Json;
      };
      admin_get_srs_review_context: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id: string;
          p_device_id: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_study_session_id: string;
        };
        Returns: Json;
      };
      admin_get_srs_review_replay: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_request_hash: string;
          p_review_id: string;
        };
        Returns: Json;
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
      admin_link_practice_srs_qualification: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_explicitly_accepted_at: string;
          p_learner_profile_id: string;
          p_practice_attempt_id: string;
          p_profile_session_id: string;
          p_qualification_id: string;
          p_review_log_id: string;
          p_selected_rating: Database["public"]["Enums"]["review_rating"];
        };
        Returns: Json;
      };
      admin_mark_portability_upload_deleted: {
        Args: { p_account_id: string; p_import_job_id: string };
        Returns: boolean;
      };
      admin_preview_srs_algorithm_migration: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_deck_ids: string[];
          p_device_id: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_target_preset_id: string;
        };
        Returns: Json;
      };
      admin_process_account_deletion: {
        Args: { p_deletion_job_id: string; p_idempotency_key: string };
        Returns: string;
      };
      admin_pull_sync_changes: {
        Args: {
          p_actor_account_id: string;
          p_after_sequence: number;
          p_auth_session_id: string;
          p_device_id: string;
          p_learner_profile_id: string;
          p_limit?: number;
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_purge_expired_guest_sessions: {
        Args: { p_before?: string };
        Returns: number;
      };
      admin_record_answer_override: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_learner_profile_id: string;
          p_override_id: string;
          p_practice_attempt_id: string;
          p_profile_session_id: string;
          p_reason_code: string;
          p_replacement_verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Returns: Json;
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
      admin_record_personal_best: {
        Args: {
          p_achieved_at: string;
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_higher_is_better: boolean;
          p_learner_profile_id: string;
          p_metric: string;
          p_mode: Database["public"]["Enums"]["practice_mode"];
          p_profile_session_id: string;
          p_scope_hash: string;
          p_source_practice_session_id: string;
          p_source_test_attempt_id: string;
          p_value: number;
        };
        Returns: Json;
      };
      admin_record_portability_job_item: {
        Args: {
          p_canonical_id: string;
          p_item_key: string;
          p_job_id: string;
          p_job_kind: Database["public"]["Enums"]["portability_job_kind"];
          p_lease_token: string;
          p_result: string;
          p_safe_warning_codes?: string[];
          p_source_fingerprint: string;
        };
        Returns: Json;
      };
      admin_record_practice_attempt: {
        Args: {
          p_actor_account_id: string;
          p_answer_revealed: boolean;
          p_auth_session_id: string;
          p_command_hash: string;
          p_complete_item: boolean;
          p_confidence: number;
          p_content_version: number;
          p_correctness: number;
          p_device_id: string;
          p_duration_ms: number;
          p_expected_mastery_version: number;
          p_explanation: string;
          p_hints_used: number;
          p_idempotency_key: string;
          p_item_position: number;
          p_learner_profile_id: string;
          p_matched_rule: string;
          p_new_mastery: Json;
          p_occurred_at: string;
          p_practice_attempt_id: string;
          p_practice_session_id: string;
          p_profile_session_id: string;
          p_response_hash: string;
          p_response_kind: string;
          p_response_text: string;
          p_retention: Database["public"]["Enums"]["answer_retention"];
          p_retry_count: number;
          p_self_confidence: number;
          p_suggested_rating: Database["public"]["Enums"]["review_rating"];
          p_verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Returns: Json;
      };
      admin_record_practice_test_response: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_available_points: number;
          p_awarded_points: number;
          p_card_id: string;
          p_device_id: string;
          p_learner_profile_id: string;
          p_occurred_at: string;
          p_position: number;
          p_practice_attempt_id: string;
          p_profile_session_id: string;
          p_question_kind: string;
          p_response_id: string;
          p_test_attempt_id: string;
          p_verdict: Database["public"]["Enums"]["practice_verdict"];
        };
        Returns: Json;
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
      admin_register_export_artifact: {
        Args: {
          p_account_id: string;
          p_byte_size: number;
          p_display_name: string;
          p_expires_at: string;
          p_export_job_id: string;
          p_format: Database["public"]["Enums"]["portability_format"];
          p_loss_summary: Json;
          p_mime_type: string;
          p_sha256: string;
          p_storage_path: string;
          p_warning_count: number;
        };
        Returns: {
          account_id: string;
          available: boolean;
          byte_size: number;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          expires_at: string;
          export_job_id: string;
          format: Database["public"]["Enums"]["portability_format"];
          id: string;
          loss_summary: Json;
          mime_type: string;
          sha256: string;
          warning_count: number;
        };
        SetofOptions: {
          from: "*";
          to: "export_artifacts";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_register_portability_upload: {
        Args: {
          p_account_id: string;
          p_byte_size: number;
          p_declared_mime_type: string;
          p_detected_mime_type: string;
          p_expires_at: string;
          p_import_job_id: string;
          p_sha256: string;
          p_storage_path: string;
        };
        Returns: string;
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
      admin_replace_srs_schedule: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id: string;
          p_device_id: string;
          p_expected_schedule_version: number;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_operation: Database["public"]["Enums"]["schedule_operation_kind"];
          p_operation_event_id: string;
          p_preset_id: string;
          p_preset_version: number;
          p_profile_session_id: string;
          p_schedule_after: Json;
          p_scheduler_version: string;
        };
        Returns: Json;
      };
      admin_report_study_content: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id: string;
          p_details: string;
          p_device_id: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_reason: Database["public"]["Enums"]["study_content_report_reason"];
          p_report_id: string;
        };
        Returns: Json;
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
      admin_restore_portability_evidence_chunk: {
        Args: {
          p_account_id: string;
          p_card_id_map: Json;
          p_chunk_ordinal: number;
          p_import_job_id: string;
          p_learner_profile_id: string;
          p_lease_token: string;
          p_mastery: Json;
          p_practice: Json;
          p_progress_policy: string;
        };
        Returns: Json;
      };
      admin_restore_portability_progress_chunk: {
        Args: {
          p_account_id: string;
          p_card_id_map: Json;
          p_import_job_id: string;
          p_learner_profile_id: string;
          p_lease_token: string;
          p_progress_policy: string;
          p_reviews: Json;
          p_schedules: Json;
        };
        Returns: Json;
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
      admin_save_srs_preset: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_configuration: Json;
          p_device_id: string;
          p_expected_version: number;
          p_learner_profile_id: string;
          p_name: string;
          p_preset_id: string;
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_save_study_filter: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_definition: Json;
          p_device_id: string;
          p_expected_version: number;
          p_filter_id: string;
          p_learner_profile_id: string;
          p_name: string;
          p_profile_session_id: string;
        };
        Returns: Json;
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
      admin_set_srs_schedule_control:
        | {
            Args: {
              p_actor_account_id: string;
              p_auth_session_id: string;
              p_card_id: string;
              p_device_id: string;
              p_effective_at: string;
              p_idempotency_key: string;
              p_learner_profile_id: string;
              p_operation: Database["public"]["Enums"]["schedule_operation_kind"];
              p_operation_event_id: string;
              p_profile_session_id: string;
              p_value: Json;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_actor_account_id: string;
              p_auth_session_id: string;
              p_card_id: string;
              p_device_id: string;
              p_effective_at: string;
              p_idempotency_key: string;
              p_learner_profile_id: string;
              p_operation: Database["public"]["Enums"]["schedule_operation_kind"];
              p_operation_event_id: string;
              p_profile_session_id: string;
              p_scheduler_version: string;
              p_study_session_id: string;
              p_value: Json;
            };
            Returns: Json;
          };
      admin_undo_srs_review: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_reason?: string;
          p_review_log_id: string;
          p_undo_event_id: string;
        };
        Returns: Json;
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
      admin_update_sync_device_preferences: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_learner_profile_id: string;
          p_media_download_preference: string;
          p_metered_connection_preference: string;
          p_profile_session_id: string;
          p_synchronization_paused: boolean;
        };
        Returns: Json;
      };
      admin_upsert_accepted_answer_rules: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_card_id: string;
          p_device_id: string;
          p_expected_version: number;
          p_learner_profile_id: string;
          p_profile_session_id: string;
          p_rule_id: string;
          p_rules: Json;
          p_schema_version: number;
        };
        Returns: Json;
      };
      admin_upsert_exam_plan: {
        Args: {
          p_actor_account_id: string;
          p_assumptions: Json;
          p_auth_session_id: string;
          p_config_schema_version: number;
          p_device_id: string;
          p_exam_at: string;
          p_exam_plan_id: string;
          p_expected_version: number;
          p_learner_profile_id: string;
          p_name: string;
          p_occurred_at: string;
          p_plan: Json;
          p_profile_session_id: string;
          p_scope: Json;
          p_status: Database["public"]["Enums"]["exam_plan_status"];
          p_timezone: string;
        };
        Returns: Json;
      };
      admin_upsert_learning_goal: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_device_id: string;
          p_expected_version: number;
          p_goal_id: string;
          p_goal_type: string;
          p_learner_profile_id: string;
          p_name: string;
          p_occurred_at: string;
          p_profile_session_id: string;
          p_progress: Json;
          p_status: Database["public"]["Enums"]["learning_goal_status"];
          p_target: Json;
        };
        Returns: Json;
      };
      admin_upsert_practice_mode_preference: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_config: Json;
          p_config_schema_version: number;
          p_device_id: string;
          p_expected_version: number;
          p_learner_profile_id: string;
          p_mode: Database["public"]["Enums"]["practice_mode"];
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_upsert_practice_test_definition: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_config: Json;
          p_config_schema_version: number;
          p_definition_id: string;
          p_device_id: string;
          p_expected_version: number;
          p_learner_profile_id: string;
          p_name: string;
          p_occurred_at: string;
          p_profile_session_id: string;
        };
        Returns: Json;
      };
      admin_upsert_product_guide_progress: {
        Args: {
          p_actor_account_id: string;
          p_auth_session_id: string;
          p_context_learner_profile_id: string;
          p_current_step: number;
          p_device_id: string;
          p_guide_key: string;
          p_guide_version: number;
          p_learner_profile_id: string;
          p_metadata: Json;
          p_metadata_schema_version: number;
          p_profile_session_id: string;
          p_progress_id: string;
          p_seen_at: string;
          p_status: Database["public"]["Enums"]["product_guide_status"];
        };
        Returns: Json;
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
      admin_yield_portability_job: {
        Args: {
          p_job_id: string;
          p_job_kind: Database["public"]["Enums"]["portability_job_kind"];
          p_lease_token: string;
          p_next_phase: string;
        };
        Returns: Json;
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
      current_apply_deck_settings_and_publication: {
        Args: {
          p_action: string;
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_patch: Json;
          p_visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_archive_deck: {
        Args: {
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_assert_self_context: { Args: never; Returns: string };
      current_bulk_move_notes: {
        Args: {
          p_expected_versions: number[];
          p_idempotency_key: string;
          p_note_ids: string[];
          p_source_deck_id: string;
          p_target_deck_id: string;
        };
        Returns: Json;
      };
      current_bulk_tag_notes: {
        Args: {
          p_add_tags: string[];
          p_deck_id: string;
          p_expected_versions: number[];
          p_idempotency_key: string;
          p_note_ids: string[];
          p_remove_tags: string[];
        };
        Returns: Json;
      };
      current_cancel_account_deletion: {
        Args: {
          p_deletion_job_id: string;
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_cancel_portability_job: {
        Args: {
          p_job_id: string;
          p_job_kind: Database["public"]["Enums"]["portability_job_kind"];
        };
        Returns: Json;
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
      current_create_deck: {
        Args: {
          p_description_doc: Json;
          p_folder_id: string;
          p_idempotency_key: string;
          p_title: string;
          p_visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_create_export_job: {
        Args: {
          p_adapter_code: string;
          p_export_format: Database["public"]["Enums"]["portability_format"];
          p_export_scope: Json;
          p_idempotency_key: string;
          p_learner_profile_id: string;
          p_payload_fingerprint: string;
          p_requested_options: Json;
        };
        Returns: {
          account_id: string;
          adapter_code: string;
          cancelled_at: string | null;
          completed_at: string | null;
          current_phase: string;
          error_count: number;
          expires_at: string;
          export_format: Database["public"]["Enums"]["portability_format"];
          export_scope: Json;
          id: string;
          idempotency_key: string;
          learner_profile_id: string | null;
          payload_fingerprint: string;
          processed_count: number;
          requested_at: string;
          requested_options: Json;
          safe_error_code: string | null;
          safe_error_summary: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["portability_job_status"];
          total_count: number | null;
          updated_at: string;
          warning_count: number;
        };
        SetofOptions: {
          from: "*";
          to: "export_jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_create_folder: {
        Args: { p_idempotency_key: string; p_name: string; p_parent_id: string };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          owner_account_id: string;
          parent_id: string | null;
          position: number;
          status: Database["public"]["Enums"]["folder_status"];
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "folders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_create_import_job: {
        Args: {
          p_adapter_code: string;
          p_idempotency_key: string;
          p_kind: Database["public"]["Enums"]["portability_job_kind"];
          p_learner_profile_id: string;
          p_payload_fingerprint: string;
          p_requested_policy: Json;
          p_source_byte_size: number;
          p_source_display_name: string;
          p_source_format: Database["public"]["Enums"]["portability_format"];
          p_source_sha256: string;
        };
        Returns: {
          account_id: string;
          adapter_code: string;
          cancelled_at: string | null;
          completed_at: string | null;
          current_phase: string;
          error_count: number;
          expires_at: string;
          id: string;
          idempotency_key: string;
          inspection_summary: Json;
          kind: Database["public"]["Enums"]["portability_job_kind"];
          learner_profile_id: string | null;
          payload_fingerprint: string;
          processed_count: number;
          requested_at: string;
          requested_policy: Json;
          safe_error_code: string | null;
          safe_error_summary: string | null;
          source_byte_size: number;
          source_display_name: string;
          source_format: Database["public"]["Enums"]["portability_format"];
          source_sha256: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["portability_job_status"];
          total_count: number | null;
          updated_at: string;
          warning_count: number;
        };
        SetofOptions: {
          from: "*";
          to: "import_jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_create_note_type: {
        Args: {
          p_description: string;
          p_display_name: string;
          p_fields: Json;
          p_idempotency_key: string;
          p_templates: Json;
        };
        Returns: {
          card_kind: Database["public"]["Enums"]["card_kind"];
          code: string;
          created_at: string;
          deleted_at: string | null;
          description: string;
          display_name: string;
          id: string;
          is_system: boolean;
          owner_account_id: string | null;
          schema_version: number;
          template_policy: Json;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "note_types";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_delete_deck: {
        Args: {
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_delete_folder: {
        Args: {
          p_expected_version: number;
          p_folder_id: string;
          p_idempotency_key: string;
        };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          owner_account_id: string;
          parent_id: string | null;
          position: number;
          status: Database["public"]["Enums"]["folder_status"];
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "folders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_delete_note: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_note_id: string;
        };
        Returns: {
          card_payload: Json;
          content_hash: string;
          created_at: string;
          created_by: string;
          deck_id: string;
          deleted_at: string | null;
          id: string;
          metadata: Json;
          note_type_id: string;
          sort_text: string;
          source_reference: string | null;
          updated_at: string;
          updated_by: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "notes";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_duplicate_deck: {
        Args: {
          p_folder_id: string;
          p_idempotency_key: string;
          p_source_deck_id: string;
          p_title: string;
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_get_deck_media: {
        Args: { p_deck_id: string };
        Returns: {
          alt_text: string;
          byte_size: number;
          duration_ms: number;
          height: number;
          kind: Database["public"]["Enums"]["media_kind"];
          media_asset_id: string;
          media_public_id: string;
          mime_type: string;
          purpose: Database["public"]["Enums"]["media_reference_purpose"];
          reference_id: string;
          reference_position: number;
          reference_type: Database["public"]["Enums"]["media_reference_type"];
          status: Database["public"]["Enums"]["media_status"];
          storage_bucket: string;
          storage_path: string;
          width: number;
        }[];
      };
      current_get_library_counts: {
        Args: never;
        Returns: {
          active_decks: number;
          archived_decks: number;
          cards: number;
          folders: number;
          notes: number;
        }[];
      };
      current_get_media_asset: {
        Args: { p_media_asset_id: string };
        Returns: {
          alt_text: string;
          byte_size: number;
          duration_ms: number;
          height: number;
          kind: Database["public"]["Enums"]["media_kind"];
          media_asset_id: string;
          media_public_id: string;
          mime_type: string;
          storage_bucket: string;
          storage_path: string;
          width: number;
        }[];
      };
      current_guardian_exit_managed_session: {
        Args: {
          p_idempotency_key: string;
          p_reauthentication_proof_hash: string;
        };
        Returns: boolean;
      };
      current_link_media: {
        Args: {
          p_alt_text: string;
          p_idempotency_key: string;
          p_media_asset_id: string;
          p_owner_id: string;
          p_owner_type: Database["public"]["Enums"]["media_reference_type"];
          p_position: number;
          p_purpose: Database["public"]["Enums"]["media_reference_purpose"];
        };
        Returns: {
          alt_text: string | null;
          created_at: string;
          created_by: string;
          deck_id: string;
          deleted_at: string | null;
          field_value_id: string | null;
          id: string;
          media_asset_id: string;
          note_id: string | null;
          owner_id: string;
          position: number;
          purpose: Database["public"]["Enums"]["media_reference_purpose"];
          reference_type: Database["public"]["Enums"]["media_reference_type"];
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "media_references";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_move_folder: {
        Args: {
          p_expected_version: number;
          p_folder_id: string;
          p_idempotency_key: string;
          p_parent_id: string;
        };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          owner_account_id: string;
          parent_id: string | null;
          position: number;
          status: Database["public"]["Enums"]["folder_status"];
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "folders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_publish_deck: {
        Args: {
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_register_media_asset: {
        Args: {
          p_alt_text: string;
          p_byte_size: number;
          p_duration_ms: number;
          p_height: number;
          p_idempotency_key: string;
          p_kind: Database["public"]["Enums"]["media_kind"];
          p_mime_type: string;
          p_sha256: string;
          p_width: number;
        };
        Returns: {
          alt_text: string | null;
          byte_size: number;
          created_at: string;
          delete_after: string | null;
          deleted_at: string | null;
          detected_mime_type: string | null;
          duration_ms: number | null;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          magic_verified: boolean;
          metadata: Json;
          mime_type: string;
          owner_account_id: string;
          public_id: string;
          reference_count: number;
          sha256: string;
          status: Database["public"]["Enums"]["media_status"];
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          version: number;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_release_media_reference: {
        Args: { p_idempotency_key: string; p_media_reference_id: string };
        Returns: {
          alt_text: string | null;
          created_at: string;
          created_by: string;
          deck_id: string;
          deleted_at: string | null;
          field_value_id: string | null;
          id: string;
          media_asset_id: string;
          note_id: string | null;
          owner_id: string;
          position: number;
          purpose: Database["public"]["Enums"]["media_reference_purpose"];
          reference_type: Database["public"]["Enums"]["media_reference_type"];
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "media_references";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      current_restore_deck: {
        Args: {
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_restore_deck_version: {
        Args: {
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_version_number: number;
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_retry_portability_job: {
        Args: {
          p_job_id: string;
          p_job_kind: Database["public"]["Enums"]["portability_job_kind"];
        };
        Returns: Json;
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
      current_unpublish_deck: {
        Args: {
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_update_deck: {
        Args: {
          p_deck_id: string;
          p_expected_version: number;
          p_idempotency_key: string;
          p_patch: Json;
        };
        Returns: {
          archived_at: string | null;
          card_count: number;
          content_hash: string;
          cover_asset_id: string | null;
          created_at: string;
          current_version: number;
          default_note_type_id: string;
          deleted_at: string | null;
          description_doc: Json;
          description_plain: string;
          fork_mode: string | null;
          id: string;
          language_back: string | null;
          language_front: string | null;
          license: Database["public"]["Enums"]["deck_license"];
          note_count: number;
          owner_account_id: string;
          public_id: string;
          published_at: string | null;
          published_version: number | null;
          slug: string;
          source_deck_id: string | null;
          status: Database["public"]["Enums"]["deck_status"];
          theme: string;
          title: string;
          updated_at: string;
          version: number;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "decks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_update_folder: {
        Args: {
          p_expected_version: number;
          p_folder_id: string;
          p_idempotency_key: string;
          p_name: string;
          p_parent_id: string;
        };
        Returns: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          owner_account_id: string;
          parent_id: string | null;
          position: number;
          status: Database["public"]["Enums"]["folder_status"];
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "folders";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      current_update_note_type: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_note_type_id: string;
          p_patch: Json;
        };
        Returns: {
          card_kind: Database["public"]["Enums"]["card_kind"];
          code: string;
          created_at: string;
          deleted_at: string | null;
          description: string;
          display_name: string;
          id: string;
          is_system: boolean;
          owner_account_id: string | null;
          schema_version: number;
          template_policy: Json;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "note_types";
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
      current_upsert_note: {
        Args: {
          p_card_payload: Json;
          p_deck_id: string;
          p_expected_version: number;
          p_fields: Json;
          p_idempotency_key: string;
          p_note_id: string;
          p_note_type_code: string;
          p_tags: string[];
        };
        Returns: Json;
      };
      current_upsert_note_definition_with_media: {
        Args: {
          p_card_payload: Json;
          p_custom_note_type_definition?: Json;
          p_deck_id: string;
          p_expected_version: number;
          p_fields: Json;
          p_idempotency_key: string;
          p_media_links: Json;
          p_note_id: string;
          p_note_type_code: string;
          p_tags: string[];
        };
        Returns: Json;
      };
      current_upsert_note_with_media: {
        Args: {
          p_card_payload: Json;
          p_deck_id: string;
          p_expected_version: number;
          p_fields: Json;
          p_idempotency_key: string;
          p_media_links: Json;
          p_note_id: string;
          p_note_type_code: string;
          p_tags: string[];
        };
        Returns: Json;
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
      get_public_deck: {
        Args: { p_public_id: string };
        Returns: {
          card_count: number;
          card_kinds: Database["public"]["Enums"]["card_kind"][];
          content_hash: string;
          cover_media_public_id: string;
          creator_display_name: string;
          creator_handle: string;
          description_doc: Json;
          description_plain: string;
          language_back: string;
          language_front: string;
          license: Database["public"]["Enums"]["deck_license"];
          public_id: string;
          published_at: string;
          published_version: number;
          slug: string;
          theme: string;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        }[];
      };
      get_public_deck_by_slug: {
        Args: { p_slug: string };
        Returns: {
          card_count: number;
          card_kinds: Database["public"]["Enums"]["card_kind"][];
          content_hash: string;
          cover_media_public_id: string;
          creator_display_name: string;
          creator_handle: string;
          description_doc: Json;
          description_plain: string;
          language_back: string;
          language_front: string;
          license: Database["public"]["Enums"]["deck_license"];
          public_id: string;
          published_at: string;
          published_version: number;
          slug: string;
          theme: string;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["deck_visibility"];
        }[];
      };
      get_public_deck_cards: {
        Args: { p_public_id: string };
        Returns: {
          back_template: string;
          card_kind: Database["public"]["Enums"]["card_kind"];
          card_payload: Json;
          card_public_id: string;
          content_hash: string;
          field_values: Json;
          front_template: string;
          generation_key: string;
          ordinal: number;
          published_at: string;
          source_references: Json;
          styling_css: string;
          template_key: string;
        }[];
      };
      get_public_deck_media: {
        Args: { p_public_id: string };
        Returns: {
          alt_text: string;
          byte_size: number;
          duration_ms: number;
          height: number;
          kind: Database["public"]["Enums"]["media_kind"];
          media_public_id: string;
          mime_type: string;
          published_at: string;
          width: number;
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
      answer_retention: "discarded" | "hash_only" | "minimized_text";
      audit_actor_type: "account" | "learner_profile" | "guest" | "system";
      card_kind:
        | "basic"
        | "basic_reversed"
        | "optional_reversed"
        | "bidirectional"
        | "custom"
        | "typed_answer"
        | "cloze"
        | "image_occlusion"
        | "multiple_choice"
        | "select_all"
        | "true_false"
        | "ordering"
        | "list_answer"
        | "diagram"
        | "audio_prompt"
        | "pronunciation"
        | "drawing";
      consent_action: "granted" | "revoked";
      consent_type:
        "guardian_account" | "child_profile" | "analytics" | "public_content" | "ai_processing";
      consent_verification_method:
        "not_verified" | "local_test" | "verified_external" | "school_authorization";
      content_change_classification: "cosmetic" | "source" | "prompt" | "answer" | "structural";
      content_change_resolution: "pending" | "preserve" | "relearn" | "reset";
      deck_license: "all_rights_reserved" | "cc_by" | "cc_by_sa" | "cc0";
      deck_member_role:
        | "owner"
        | "manager"
        | "editor"
        | "suggester"
        | "viewer"
        | "study_only"
        | "host"
        | "assignment_manager";
      deck_status: "active" | "archived" | "moderated" | "deleted";
      deck_visibility: "private" | "unlisted" | "public";
      diagram_prompt_direction: "hotspot_to_label" | "label_to_hotspot" | "bidirectional";
      exam_plan_status: "active" | "completed" | "archived";
      folder_status: "active" | "deleted";
      geometry_kind: "rectangle" | "ellipse" | "polygon";
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
      learning_goal_status: "active" | "completed" | "archived";
      mastery_stage:
        | "unseen"
        | "introduced"
        | "recognition"
        | "guided_recall"
        | "free_recall"
        | "mastered"
        | "needs_refresh";
      media_kind: "image" | "audio";
      media_reference_purpose:
        "cover" | "inline" | "attachment" | "prompt" | "answer" | "reference";
      media_reference_type:
        | "deck"
        | "note"
        | "note_field"
        | "image_occlusion"
        | "diagram_hotspot"
        | "audio_prompt"
        | "pronunciation"
        | "drawing_layer";
      media_status: "pending" | "ready" | "quarantined" | "deleting" | "deleted";
      new_card_order: "created" | "due" | "random";
      new_review_mix: "before" | "after" | "interleave";
      note_field_type: "rich_text" | "plain_text" | "boolean" | "number" | "list" | "media";
      occlusion_mode: "hide_one_reveal_others" | "hide_all_reveal_one";
      portability_format:
        | "plain_text"
        | "quizlet_text"
        | "csv"
        | "tsv"
        | "lumen_json"
        | "markdown_bundle"
        | "anki_apkg"
        | "anki_colpkg"
        | "lumen_archive"
        | "encrypted_lumen_archive"
        | "print_html";
      portability_job_kind: "import" | "export" | "restore";
      portability_job_status:
        | "uploaded"
        | "inspecting"
        | "awaiting_mapping"
        | "ready"
        | "queued"
        | "running"
        | "pausing"
        | "paused"
        | "cancelling"
        | "cancelled"
        | "completed"
        | "completed_with_warnings"
        | "failed"
        | "retryable"
        | "expired";
      practice_item_status: "pending" | "shown" | "answered" | "skipped";
      practice_mode:
        "flashcards" | "learn" | "write" | "test" | "match" | "spell" | "pronunciation" | "diagram";
      practice_qualification_status: "not_eligible" | "eligible" | "qualified";
      practice_session_status: "active" | "paused" | "completed" | "abandoned";
      practice_test_status: "active" | "completed" | "abandoned";
      practice_verdict: "correct" | "partial" | "incorrect" | "needs_review";
      privacy_request_type: "access" | "export" | "deletion" | "correction";
      product_guide_status: "not_started" | "in_progress" | "completed" | "dismissed";
      reauthentication_purpose: "account_deletion" | "security_change";
      request_status: "queued" | "processing" | "completed" | "failed" | "cancelled";
      review_card_order: "due" | "relative_overdueness" | "retrievability" | "random";
      review_rating: "again" | "hard" | "good" | "easy";
      review_source:
        "today" | "deck" | "folder" | "filtered" | "review_ahead" | "cram" | "import" | "rebuild";
      schedule_operation_kind:
        | "suspend"
        | "unsuspend"
        | "star"
        | "unstar"
        | "bury"
        | "bury_siblings"
        | "forget"
        | "manual_due"
        | "reschedule"
        | "due_order"
        | "mark_leech"
        | "content_preserve"
        | "content_relearn"
        | "content_reset"
        | "rebuild"
        | "algorithm_migration";
      srs_algorithm: "fsrs" | "sm2";
      srs_leech_action: "tag" | "suspend";
      srs_optimization_status:
        | "queued"
        | "running"
        | "preview_ready"
        | "confirmed"
        | "rolled_back"
        | "failed"
        | "cancelled";
      srs_state: "new" | "learning" | "review" | "relearning";
      study_content_report_reason:
        "incorrect" | "outdated" | "unclear" | "unsafe" | "accessibility" | "other";
      study_session_item_status: "pending" | "shown" | "reviewed" | "skipped";
      study_session_mode:
        | "today"
        | "deck"
        | "folder"
        | "new_only"
        | "due_only"
        | "forgotten_today"
        | "leeches"
        | "starred"
        | "tag_query"
        | "review_ahead"
        | "cram"
        | "interval_range"
        | "card_state";
      study_session_status: "active" | "paused" | "completed" | "abandoned";
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
      answer_retention: ["discarded", "hash_only", "minimized_text"],
      audit_actor_type: ["account", "learner_profile", "guest", "system"],
      card_kind: [
        "basic",
        "basic_reversed",
        "optional_reversed",
        "bidirectional",
        "custom",
        "typed_answer",
        "cloze",
        "image_occlusion",
        "multiple_choice",
        "select_all",
        "true_false",
        "ordering",
        "list_answer",
        "diagram",
        "audio_prompt",
        "pronunciation",
        "drawing",
      ],
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
      content_change_classification: ["cosmetic", "source", "prompt", "answer", "structural"],
      content_change_resolution: ["pending", "preserve", "relearn", "reset"],
      deck_license: ["all_rights_reserved", "cc_by", "cc_by_sa", "cc0"],
      deck_member_role: [
        "owner",
        "manager",
        "editor",
        "suggester",
        "viewer",
        "study_only",
        "host",
        "assignment_manager",
      ],
      deck_status: ["active", "archived", "moderated", "deleted"],
      deck_visibility: ["private", "unlisted", "public"],
      diagram_prompt_direction: ["hotspot_to_label", "label_to_hotspot", "bidirectional"],
      exam_plan_status: ["active", "completed", "archived"],
      folder_status: ["active", "deleted"],
      geometry_kind: ["rectangle", "ellipse", "polygon"],
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
      learning_goal_status: ["active", "completed", "archived"],
      mastery_stage: [
        "unseen",
        "introduced",
        "recognition",
        "guided_recall",
        "free_recall",
        "mastered",
        "needs_refresh",
      ],
      media_kind: ["image", "audio"],
      media_reference_purpose: ["cover", "inline", "attachment", "prompt", "answer", "reference"],
      media_reference_type: [
        "deck",
        "note",
        "note_field",
        "image_occlusion",
        "diagram_hotspot",
        "audio_prompt",
        "pronunciation",
        "drawing_layer",
      ],
      media_status: ["pending", "ready", "quarantined", "deleting", "deleted"],
      new_card_order: ["created", "due", "random"],
      new_review_mix: ["before", "after", "interleave"],
      note_field_type: ["rich_text", "plain_text", "boolean", "number", "list", "media"],
      occlusion_mode: ["hide_one_reveal_others", "hide_all_reveal_one"],
      portability_format: [
        "plain_text",
        "quizlet_text",
        "csv",
        "tsv",
        "lumen_json",
        "markdown_bundle",
        "anki_apkg",
        "anki_colpkg",
        "lumen_archive",
        "encrypted_lumen_archive",
        "print_html",
      ],
      portability_job_kind: ["import", "export", "restore"],
      portability_job_status: [
        "uploaded",
        "inspecting",
        "awaiting_mapping",
        "ready",
        "queued",
        "running",
        "pausing",
        "paused",
        "cancelling",
        "cancelled",
        "completed",
        "completed_with_warnings",
        "failed",
        "retryable",
        "expired",
      ],
      practice_item_status: ["pending", "shown", "answered", "skipped"],
      practice_mode: [
        "flashcards",
        "learn",
        "write",
        "test",
        "match",
        "spell",
        "pronunciation",
        "diagram",
      ],
      practice_qualification_status: ["not_eligible", "eligible", "qualified"],
      practice_session_status: ["active", "paused", "completed", "abandoned"],
      practice_test_status: ["active", "completed", "abandoned"],
      practice_verdict: ["correct", "partial", "incorrect", "needs_review"],
      privacy_request_type: ["access", "export", "deletion", "correction"],
      product_guide_status: ["not_started", "in_progress", "completed", "dismissed"],
      reauthentication_purpose: ["account_deletion", "security_change"],
      request_status: ["queued", "processing", "completed", "failed", "cancelled"],
      review_card_order: ["due", "relative_overdueness", "retrievability", "random"],
      review_rating: ["again", "hard", "good", "easy"],
      review_source: [
        "today",
        "deck",
        "folder",
        "filtered",
        "review_ahead",
        "cram",
        "import",
        "rebuild",
      ],
      schedule_operation_kind: [
        "suspend",
        "unsuspend",
        "star",
        "unstar",
        "bury",
        "bury_siblings",
        "forget",
        "manual_due",
        "reschedule",
        "due_order",
        "mark_leech",
        "content_preserve",
        "content_relearn",
        "content_reset",
        "rebuild",
        "algorithm_migration",
      ],
      srs_algorithm: ["fsrs", "sm2"],
      srs_leech_action: ["tag", "suspend"],
      srs_optimization_status: [
        "queued",
        "running",
        "preview_ready",
        "confirmed",
        "rolled_back",
        "failed",
        "cancelled",
      ],
      srs_state: ["new", "learning", "review", "relearning"],
      study_content_report_reason: [
        "incorrect",
        "outdated",
        "unclear",
        "unsafe",
        "accessibility",
        "other",
      ],
      study_session_item_status: ["pending", "shown", "reviewed", "skipped"],
      study_session_mode: [
        "today",
        "deck",
        "folder",
        "new_only",
        "due_only",
        "forgotten_today",
        "leeches",
        "starred",
        "tag_query",
        "review_ahead",
        "cram",
        "interval_range",
        "card_state",
      ],
      study_session_status: ["active", "paused", "completed", "abandoned"],
      theme_preference: ["system", "light", "dark"],
    },
  },
} as const;
