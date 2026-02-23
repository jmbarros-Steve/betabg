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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_assets: {
        Row: {
          asset_url: string | null
          client_id: string | null
          created_at: string | null
          creative_id: string | null
          id: string
          tipo: string | null
        }
        Insert: {
          asset_url?: string | null
          client_id?: string | null
          created_at?: string | null
          creative_id?: string | null
          id?: string
          tipo?: string | null
        }
        Update: {
          asset_url?: string | null
          client_id?: string | null
          created_at?: string | null
          creative_id?: string | null
          id?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_assets_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives: {
        Row: {
          angulo: string
          asset_url: string | null
          brief_visual: Json | null
          client_id: string
          created_at: string
          cta: string | null
          custom_instructions: string | null
          dct_briefs: Json | null
          dct_copies: Json | null
          dct_descripciones: Json | null
          dct_imagenes: Json | null
          dct_titulos: Json | null
          descripcion: string | null
          estado: string
          formato: string
          foto_base_url: string | null
          funnel: string
          id: string
          prediction_id: string | null
          prompt_generacion: string | null
          texto_principal: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          angulo: string
          asset_url?: string | null
          brief_visual?: Json | null
          client_id: string
          created_at?: string
          cta?: string | null
          custom_instructions?: string | null
          dct_briefs?: Json | null
          dct_copies?: Json | null
          dct_descripciones?: Json | null
          dct_imagenes?: Json | null
          dct_titulos?: Json | null
          descripcion?: string | null
          estado?: string
          formato: string
          foto_base_url?: string | null
          funnel: string
          id?: string
          prediction_id?: string | null
          prompt_generacion?: string | null
          texto_principal?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          angulo?: string
          asset_url?: string | null
          brief_visual?: Json | null
          client_id?: string
          created_at?: string
          cta?: string | null
          custom_instructions?: string | null
          dct_briefs?: Json | null
          dct_copies?: Json | null
          dct_descripciones?: Json | null
          dct_imagenes?: Json | null
          dct_titulos?: Json | null
          descripcion?: string | null
          estado?: string
          formato?: string
          foto_base_url?: string | null
          funnel?: string
          id?: string
          prediction_id?: string | null
          prompt_generacion?: string | null
          texto_principal?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ad_references: {
        Row: {
          angulo: string
          client_id: string | null
          copy_patterns: Json | null
          created_at: string | null
          id: string
          image_url: string
          quality_score: number | null
          visual_patterns: Json | null
        }
        Insert: {
          angulo: string
          client_id?: string | null
          copy_patterns?: Json | null
          created_at?: string | null
          id?: string
          image_url: string
          quality_score?: number | null
          visual_patterns?: Json | null
        }
        Update: {
          angulo?: string
          client_id?: string | null
          copy_patterns?: Json | null
          created_at?: string | null
          id?: string
          image_url?: string
          quality_score?: number | null
          visual_patterns?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_references_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          excerpt: string | null
          id: string
          published: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      brand_research: {
        Row: {
          client_id: string
          created_at: string
          id: string
          research_data: Json
          research_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          research_data?: Json
          research_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          research_data?: Json
          research_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_research_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_personas: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_complete: boolean
          persona_data: Json
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_complete?: boolean
          persona_data?: Json
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_complete?: boolean
          persona_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_personas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_metrics: {
        Row: {
          campaign_id: string
          campaign_name: string
          clicks: number | null
          connection_id: string
          conversion_value: number | null
          conversions: number | null
          cpc: number | null
          cpm: number | null
          created_at: string
          ctr: number | null
          currency: string | null
          id: string
          impressions: number | null
          metric_date: string
          platform: string
          roas: number | null
          shop_domain: string | null
          spend: number | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          campaign_name: string
          clicks?: number | null
          connection_id: string
          conversion_value?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          currency?: string | null
          id?: string
          impressions?: number | null
          metric_date: string
          platform: string
          roas?: number | null
          shop_domain?: string | null
          spend?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          clicks?: number | null
          connection_id?: string
          conversion_value?: number | null
          conversions?: number | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string
          ctr?: number | null
          currency?: string | null
          id?: string
          impressions?: number | null
          metric_date?: string
          platform?: string
          roas?: number | null
          shop_domain?: string | null
          spend?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_metrics_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recommendations: {
        Row: {
          campaign_id: string
          connection_id: string
          created_at: string
          id: string
          is_dismissed: boolean | null
          platform: string
          priority: string | null
          recommendation_text: string
          recommendation_type: string
          shop_domain: string | null
        }
        Insert: {
          campaign_id: string
          connection_id: string
          created_at?: string
          id?: string
          is_dismissed?: boolean | null
          platform: string
          priority?: string | null
          recommendation_text: string
          recommendation_type: string
          shop_domain?: string | null
        }
        Update: {
          campaign_id?: string
          connection_id?: string
          created_at?: string
          id?: string
          is_dismissed?: boolean | null
          platform?: string
          priority?: string | null
          recommendation_text?: string
          recommendation_type?: string
          shop_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recommendations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assets: {
        Row: {
          client_id: string
          created_at: string
          id: string
          nombre: string
          tipo: string
          updated_at: string
          url: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          nombre: string
          tipo?: string
          updated_at?: string
          url: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      client_credits: {
        Row: {
          client_id: string | null
          created_at: string
          creditos_disponibles: number
          creditos_usados: number
          id: string
          plan: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          creditos_disponibles?: number
          creditos_usados?: number
          id?: string
          plan?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          creditos_disponibles?: number
          creditos_usados?: number
          id?: string
          plan?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_financial_config: {
        Row: {
          client_id: string
          created_at: string
          default_margin_percentage: number
          id: string
          klaviyo_plan_cost: number
          other_fixed_costs: number
          other_fixed_costs_description: string | null
          payment_gateway_commission: number
          product_margins: Json
          shopify_plan_cost: number
          updated_at: string
          use_shopify_costs: boolean
        }
        Insert: {
          client_id: string
          created_at?: string
          default_margin_percentage?: number
          id?: string
          klaviyo_plan_cost?: number
          other_fixed_costs?: number
          other_fixed_costs_description?: string | null
          payment_gateway_commission?: number
          product_margins?: Json
          shopify_plan_cost?: number
          updated_at?: string
          use_shopify_costs?: boolean
        }
        Update: {
          client_id?: string
          created_at?: string
          default_margin_percentage?: number
          id?: string
          klaviyo_plan_cost?: number
          other_fixed_costs?: number
          other_fixed_costs_description?: string | null
          payment_gateway_commission?: number
          product_margins?: Json
          shopify_plan_cost?: number
          updated_at?: string
          use_shopify_costs?: boolean
        }
        Relationships: []
      }
      clients: {
        Row: {
          client_user_id: string | null
          company: string | null
          created_at: string
          email: string | null
          fase_negocio: string | null
          hourly_rate: number
          id: string
          logo_url: string | null
          name: string
          presupuesto_ads: number | null
          shop_domain: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          client_user_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          fase_negocio?: string | null
          hourly_rate?: number
          id?: string
          logo_url?: string | null
          name: string
          presupuesto_ads?: number | null
          shop_domain?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          client_user_id?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          fase_negocio?: string | null
          hourly_rate?: number
          id?: string
          logo_url?: string | null
          name?: string
          presupuesto_ads?: number | null
          shop_domain?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      competitor_ads: {
        Row: {
          ad_description: string | null
          ad_headline: string | null
          ad_library_id: string
          ad_text: string | null
          ad_type: string | null
          client_id: string
          created_at: string
          cta_type: string | null
          days_running: number | null
          id: string
          image_url: string | null
          is_active: boolean
          started_at: string | null
          tracking_id: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ad_description?: string | null
          ad_headline?: string | null
          ad_library_id: string
          ad_text?: string | null
          ad_type?: string | null
          client_id: string
          created_at?: string
          cta_type?: string | null
          days_running?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          started_at?: string | null
          tracking_id: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ad_description?: string | null
          ad_headline?: string | null
          ad_library_id?: string
          ad_text?: string | null
          ad_type?: string | null
          client_id?: string
          created_at?: string
          cta_type?: string | null
          days_running?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          started_at?: string | null
          tracking_id?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_ads_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "competitor_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_tracking: {
        Row: {
          client_id: string
          created_at: string
          deep_dive_data: Json | null
          display_name: string | null
          id: string
          ig_handle: string
          is_active: boolean
          last_deep_dive_at: string | null
          last_sync_at: string | null
          meta_page_id: string | null
          profile_pic_url: string | null
          store_url: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          deep_dive_data?: Json | null
          display_name?: string | null
          id?: string
          ig_handle: string
          is_active?: boolean
          last_deep_dive_at?: string | null
          last_sync_at?: string | null
          meta_page_id?: string | null
          profile_pic_url?: string | null
          store_url?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          deep_dive_data?: Json | null
          display_name?: string | null
          id?: string
          ig_handle?: string
          is_active?: boolean
          last_deep_dive_at?: string | null
          last_sync_at?: string | null
          meta_page_id?: string | null
          profile_pic_url?: string | null
          store_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_tracking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          accion: string
          client_id: string | null
          costo_real_usd: number | null
          created_at: string
          creditos_usados: number
          id: string
        }
        Insert: {
          accion: string
          client_id?: string | null
          costo_real_usd?: number | null
          created_at?: string
          creditos_usados?: number
          id?: string
        }
        Update: {
          accion?: string
          client_id?: string | null
          costo_real_usd?: number | null
          created_at?: string
          creditos_usados?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          id: string
          invoice_number: string
          month: number
          status: string
          total_amount: number
          total_hours: number
          user_id: string
          year: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          invoice_number: string
          month: number
          status?: string
          total_amount: number
          total_hours: number
          user_id: string
          year: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          invoice_number?: string
          month?: number
          status?: string
          total_amount?: number
          total_hours?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      klaviyo_email_plans: {
        Row: {
          admin_notes: string | null
          campaign_date: string | null
          campaign_subject: string | null
          client_id: string
          client_notes: string | null
          created_at: string
          emails: Json
          flow_type: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          campaign_date?: string | null
          campaign_subject?: string | null
          client_id: string
          client_notes?: string | null
          created_at?: string
          emails?: Json
          flow_type: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          campaign_date?: string | null
          campaign_subject?: string | null
          client_id?: string
          client_notes?: string | null
          created_at?: string
          emails?: Json
          flow_type?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "klaviyo_email_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_queue: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          processed_at: string | null
          rules_extracted: number | null
          source_content: string
          source_title: string | null
          source_type: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          rules_extracted?: number | null
          source_content: string
          source_title?: string | null
          source_type: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          rules_extracted?: number | null
          source_content?: string
          source_title?: string | null
          source_type?: string
          status?: string | null
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          nonce: string
          shop_domain: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          nonce: string
          shop_domain: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          nonce?: string
          shop_domain?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          access_token_encrypted: string | null
          account_id: string | null
          api_key_encrypted: string | null
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          refresh_token_encrypted: string | null
          shop_domain: string | null
          store_name: string | null
          store_url: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          account_id?: string | null
          api_key_encrypted?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          refresh_token_encrypted?: string | null
          shop_domain?: string | null
          store_name?: string | null
          store_url?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          account_id?: string | null
          api_key_encrypted?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          refresh_token_encrypted?: string | null
          shop_domain?: string | null
          store_name?: string | null
          store_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_metrics: {
        Row: {
          connection_id: string
          created_at: string
          currency: string | null
          id: string
          metric_date: string
          metric_type: string
          metric_value: number
          shop_domain: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          currency?: string | null
          id?: string
          metric_date: string
          metric_type: string
          metric_value?: number
          shop_domain?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          metric_date?: string
          metric_type?: string
          metric_value?: number
          shop_domain?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_metrics_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_google_copies: {
        Row: {
          campaign_type: string
          client_id: string
          created_at: string
          custom_instructions: string | null
          descriptions: string[]
          headlines: string[]
          id: string
          long_headlines: string[] | null
          sitelinks: Json | null
        }
        Insert: {
          campaign_type: string
          client_id: string
          created_at?: string
          custom_instructions?: string | null
          descriptions: string[]
          headlines: string[]
          id?: string
          long_headlines?: string[] | null
          sitelinks?: Json | null
        }
        Update: {
          campaign_type?: string
          client_id?: string
          created_at?: string
          custom_instructions?: string | null
          descriptions?: string[]
          headlines?: string[]
          id?: string
          long_headlines?: string[] | null
          sitelinks?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_google_copies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meta_copies: {
        Row: {
          ad_type: string
          client_id: string
          created_at: string
          custom_instructions: string | null
          descriptions: string[]
          funnel_stage: string
          has_script: boolean
          headlines: string[]
          id: string
          primary_texts: string[]
          video_hooks: string[] | null
          video_scripts: string[] | null
        }
        Insert: {
          ad_type: string
          client_id: string
          created_at?: string
          custom_instructions?: string | null
          descriptions?: string[]
          funnel_stage: string
          has_script?: boolean
          headlines?: string[]
          id?: string
          primary_texts?: string[]
          video_hooks?: string[] | null
          video_scripts?: string[] | null
        }
        Update: {
          ad_type?: string
          client_id?: string
          created_at?: string
          custom_instructions?: string | null
          descriptions?: string[]
          funnel_stage?: string
          has_script?: boolean
          headlines?: string[]
          id?: string
          primary_texts?: string[]
          video_hooks?: string[] | null
          video_scripts?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_meta_copies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      steve_bugs: {
        Row: {
          activo: boolean | null
          categoria: string
          created_at: string | null
          descripcion: string
          ejemplo_bueno: string | null
          ejemplo_malo: string | null
          id: string
        }
        Insert: {
          activo?: boolean | null
          categoria: string
          created_at?: string | null
          descripcion: string
          ejemplo_bueno?: string | null
          ejemplo_malo?: string | null
          id?: string
        }
        Update: {
          activo?: boolean | null
          categoria?: string
          created_at?: string | null
          descripcion?: string
          ejemplo_bueno?: string | null
          ejemplo_malo?: string | null
          id?: string
        }
        Relationships: []
      }
      steve_conversations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "steve_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      steve_feedback: {
        Row: {
          client_id: string
          content_id: string | null
          content_type: string
          created_at: string
          feedback_text: string | null
          id: string
          improvement_notes: string | null
          rating: number | null
        }
        Insert: {
          client_id: string
          content_id?: string | null
          content_type: string
          created_at?: string
          feedback_text?: string | null
          id?: string
          improvement_notes?: string | null
          rating?: number | null
        }
        Update: {
          client_id?: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          feedback_text?: string | null
          id?: string
          improvement_notes?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "steve_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      steve_knowledge: {
        Row: {
          activo: boolean | null
          categoria: string
          contenido: string
          created_at: string | null
          id: string
          orden: number | null
          titulo: string
        }
        Insert: {
          activo?: boolean | null
          categoria: string
          contenido: string
          created_at?: string | null
          id?: string
          orden?: number | null
          titulo: string
        }
        Update: {
          activo?: boolean | null
          categoria?: string
          contenido?: string
          created_at?: string | null
          id?: string
          orden?: number | null
          titulo?: string
        }
        Relationships: []
      }
      steve_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "steve_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "steve_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      steve_training_examples: {
        Row: {
          campaign_metrics: Json | null
          correct_analysis: string
          created_at: string
          created_by: string
          id: string
          incorrect_analysis: string | null
          is_active: boolean | null
          platform: string
          scenario_description: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          campaign_metrics?: Json | null
          correct_analysis: string
          created_at?: string
          created_by: string
          id?: string
          incorrect_analysis?: string | null
          is_active?: boolean | null
          platform: string
          scenario_description: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          campaign_metrics?: Json | null
          correct_analysis?: string
          created_at?: string
          created_by?: string
          id?: string
          incorrect_analysis?: string | null
          is_active?: boolean | null
          platform?: string
          scenario_description?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      steve_training_feedback: {
        Row: {
          campaign_id: string
          campaign_metrics: Json | null
          created_at: string
          created_by: string
          feedback_notes: string | null
          feedback_rating: string
          id: string
          improved_recommendation: string | null
          original_recommendation: string
          platform: string
          recommendation_id: string | null
          recommendation_type: string
        }
        Insert: {
          campaign_id: string
          campaign_metrics?: Json | null
          created_at?: string
          created_by: string
          feedback_notes?: string | null
          feedback_rating: string
          id?: string
          improved_recommendation?: string | null
          original_recommendation: string
          platform: string
          recommendation_id?: string | null
          recommendation_type: string
        }
        Update: {
          campaign_id?: string
          campaign_metrics?: Json | null
          created_at?: string
          created_by?: string
          feedback_notes?: string | null
          feedback_rating?: string
          id?: string
          improved_recommendation?: string | null
          original_recommendation?: string
          platform?: string
          recommendation_id?: string | null
          recommendation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "steve_training_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "campaign_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      study_resources: {
        Row: {
          content: string | null
          created_at: string
          description: string | null
          duration: string | null
          id: string
          published: boolean
          resource_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          published?: boolean
          resource_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          description?: string | null
          duration?: string | null
          id?: string
          published?: boolean
          resource_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          credits_monthly: number | null
          features: Json
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          slug: string
        }
        Insert: {
          created_at?: string
          credits_monthly?: number | null
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          price_monthly?: number
          slug: string
        }
        Update: {
          created_at?: string
          credits_monthly?: number | null
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          slug?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          billed: boolean
          client_id: string
          created_at: string
          date: string
          description: string
          hours: number
          id: string
          user_id: string
        }
        Insert: {
          billed?: boolean
          client_id: string
          created_at?: string
          date?: string
          description: string
          hours: number
          id?: string
          user_id: string
        }
        Update: {
          billed?: boolean
          client_id?: string
          created_at?: string
          date?: string
          description?: string
          hours?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          is_super_admin: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_super_admin?: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_super_admin?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          credits_reset_at: string
          credits_used: number
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_reset_at?: string
          credits_used?: number
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_reset_at?: string
          credits_used?: number
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_blog_posts: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          excerpt: string | null
          id: string | null
          published: boolean | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string | null
          published?: boolean | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string | null
          published?: boolean | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_shop: {
        Args: { _shop_domain: string; _user_id: string }
        Returns: boolean
      }
      decrypt_platform_token: {
        Args: { encrypted_token: string }
        Returns: string
      }
      encrypt_platform_token: { Args: { raw_token: string }; Returns: string }
      get_user_shop_domain: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_shopify_user: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "client"
      platform_type: "shopify" | "meta" | "google" | "klaviyo"
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
      app_role: ["admin", "client"],
      platform_type: ["shopify", "meta", "google", "klaviyo"],
    },
  },
} as const
