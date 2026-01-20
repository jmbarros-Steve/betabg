import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailStep {
  id: string;
  subject: string;
  previewText: string;
  content: string;
  delayDays: number;
  delayHours: number;
}

interface PushEmailsRequest {
  plan_id: string;
  connection_id: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { plan_id, connection_id }: PushEmailsRequest = await req.json();

    if (!plan_id || !connection_id) {
      return new Response(
        JSON.stringify({ error: 'plan_id and connection_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the email plan
    const { data: plan, error: planError } = await supabase
      .from('klaviyo_email_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      console.error('Error fetching plan:', planError);
      return new Response(
        JSON.stringify({ error: 'Plan not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the Klaviyo connection with decrypted API key
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: connection, error: connError } = await serviceSupabase
      .from('platform_connections')
      .select('*, decrypted_key:decrypt_platform_token(api_key_encrypted)')
      .eq('id', connection_id)
      .eq('platform', 'klaviyo')
      .single();

    if (connError || !connection) {
      console.error('Error fetching connection:', connError);
      return new Response(
        JSON.stringify({ error: 'Klaviyo connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const klaviyoApiKey = connection.decrypted_key;
    if (!klaviyoApiKey) {
      return new Response(
        JSON.stringify({ error: 'Klaviyo API key not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emails = plan.emails as EmailStep[];
    const createdTemplates: string[] = [];

    // Create templates in Klaviyo for each email
    for (const email of emails) {
      const templateResponse = await fetch('https://a.klaviyo.com/api/templates/', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json',
          'revision': '2024-02-15',
        },
        body: JSON.stringify({
          data: {
            type: 'template',
            attributes: {
              name: `${plan.name} - ${email.subject}`,
              editor_type: 'CODE',
              html: generateEmailHtml(email),
              text: email.content,
            },
          },
        }),
      });

      if (!templateResponse.ok) {
        const errorText = await templateResponse.text();
        console.error('Klaviyo template error:', errorText);
        throw new Error(`Failed to create template: ${errorText}`);
      }

      const templateData = await templateResponse.json();
      createdTemplates.push(templateData.data.id);
      console.log('Created template:', templateData.data.id);
    }

    // Update plan status to indicate it was pushed to Klaviyo
    await supabase
      .from('klaviyo_email_plans')
      .update({ 
        status: 'implemented',
        admin_notes: `Pushed to Klaviyo on ${new Date().toISOString()}. Template IDs: ${createdTemplates.join(', ')}`
      })
      .eq('id', plan_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${createdTemplates.length} templates in Klaviyo`,
        template_ids: createdTemplates
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Error in klaviyo-push-emails:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateEmailHtml(email: EmailStep): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${email.subject}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  <div class="preheader">${email.previewText}</div>
  ${email.content.replace(/\n/g, '<br>')}
</body>
</html>
  `.trim();
}
