import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendSingleEmail } from './send-email.js';
import { renderEmailTemplate, buildTemplateContext } from '../../lib/template-engine.js';
import { processEmailHtml } from '../../lib/email-html-processor.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Flow engine: executes flow steps when triggered by Cloud Tasks.
 * POST /api/email-flow-execute
 *
 * Supports both flat step arrays (legacy) and tree structures with conditional branching.
 * Step addressing: "0", "1", "2.yes.0", "2.no.1" etc.
 */
export async function emailFlowExecute(c: Context) {
  const body = await c.req.json();
  const { enrollment_id, step, step_path } = body;

  if (!enrollment_id) {
    return c.json({ error: 'enrollment_id is required' }, 400);
  }

  // Support both legacy integer `step` and new string `step_path`
  const effectivePath = step_path || String(step ?? 0);

  const supabase = getSupabaseAdmin();

  // 1. Fetch enrollment
  const { data: enrollment, error: enrollErr } = await supabase
    .from('email_flow_enrollments')
    .select('*, email_flows(*), email_subscribers(*)')
    .eq('id', enrollment_id)
    .single();

  if (enrollErr || !enrollment) {
    console.log(`Enrollment ${enrollment_id} not found. Skipping.`);
    return c.json({ skipped: true, reason: 'Enrollment not found' });
  }

  // 2. Check enrollment is still active
  if (enrollment.status !== 'active') {
    console.log(`Enrollment ${enrollment_id} is ${enrollment.status}. Skipping.`);
    return c.json({ skipped: true, reason: `Enrollment is ${enrollment.status}` });
  }

  // 3. Check subscriber is still subscribed
  const subscriber = enrollment.email_subscribers;
  if (!subscriber || subscriber.status !== 'subscribed') {
    console.log(`Subscriber is ${subscriber?.status}. Cancelling enrollment.`);
    await supabase
      .from('email_flow_enrollments')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', enrollment_id);
    return c.json({ skipped: true, reason: 'Subscriber is not subscribed' });
  }

  // 4. Get flow and step data
  const flow = enrollment.email_flows;
  if (!flow || flow.status !== 'active') {
    console.log(`Flow ${enrollment.flow_id} is ${flow?.status}. Skipping.`);
    return c.json({ skipped: true, reason: 'Flow is not active' });
  }

  const steps = flow.steps as any[];
  const currentStep = resolveStep(steps, effectivePath);

  if (!currentStep) {
    // All steps completed or invalid path
    await supabase
      .from('email_flow_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', enrollment_id);
    console.log(`Enrollment ${enrollment_id} completed (path ${effectivePath} resolved to null).`);
    return c.json({ completed: true });
  }

  // 5. Check quiet hours — usa el timezone del subscriber, NO UTC.
  // Contexto: antes esto comparaba contra UTC y para un subscriber chileno
  // con quiet hours 22-08 el resultado era enviar emails a las 7pm local.
  // Ahora convertimos "la hora ahora mismo" al timezone del subscriber y
  // comparamos contra ese valor. Si no hay timezone en el subscriber, el
  // default en DB es America/Santiago.
  const settings = flow.settings as any || {};
  if (settings.quiet_hours_start && settings.quiet_hours_end) {
    const now = new Date();
    const subscriberTz = subscriber.timezone || 'America/Santiago';
    let hour: number;
    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: subscriberTz,
      }).format(now);
      hour = parseInt(formatted, 10);
    } catch (tzErr) {
      // Timezone inválida en el subscriber — fallback a UTC y log warning.
      console.warn(`[flow-engine] Invalid timezone "${subscriberTz}" for subscriber ${subscriber.id}, using UTC.`);
      hour = now.getUTCHours();
    }
    const quietStart = parseInt(settings.quiet_hours_start);
    const quietEnd = parseInt(settings.quiet_hours_end);

    const inQuiet = quietStart <= quietEnd
      ? (hour >= quietStart && hour < quietEnd)
      : (hour >= quietStart || hour < quietEnd);

    if (inQuiet) {
      // Para la próxima corrida: apuntar a quietEnd en HORA LOCAL del subscriber.
      // Calculamos cuántas horas faltan hasta quietEnd local y le sumamos a "now".
      const hoursUntilEnd = (quietEnd - hour + 24) % 24 || 24;
      const nextRun = new Date(now.getTime() + hoursUntilEnd * 60 * 60 * 1000);
      // Redondear al minuto 0 de esa hora.
      nextRun.setUTCSeconds(0, 0);

      console.log(`Quiet hours active (subscriber local hour ${hour}, tz ${subscriberTz}). Rescheduling to ${nextRun.toISOString()}`);
      await scheduleFlowStep(enrollment_id, effectivePath, nextRun, enrollment.client_id);
      return c.json({ postponed: true, reason: 'Quiet hours', next_run: nextRun.toISOString() });
    }
  }

  // 6. Check exit conditions
  if (settings.exit_on_purchase && flow.trigger_type === 'abandoned_cart') {
    const { count: orderCount } = await supabase
      .from('email_events')
      .select('*', { count: 'exact', head: true })
      .eq('subscriber_id', subscriber.id)
      .eq('event_type', 'converted')
      .gte('created_at', enrollment.enrolled_at);

    if (orderCount && orderCount > 0) {
      await supabase
        .from('email_flow_enrollments')
        .update({ status: 'converted', completed_at: new Date().toISOString() })
        .eq('id', enrollment_id);
      console.log(`Subscriber converted. Exiting flow.`);
      return c.json({ converted: true });
    }
  }

  // Determine step type
  const stepType = currentStep.type || 'email';

  // ============================================================
  // Handle CONDITION step (YES/NO branch)
  // ============================================================
  if (stepType === 'condition') {
    console.log(`Evaluating condition at path ${effectivePath}`);
    const conditionMet = await evaluateBranchCondition(supabase, subscriber, enrollment, currentStep.condition);

    const branchKey = conditionMet ? 'yes' : 'no';
    const branchSteps = conditionMet ? (currentStep.yes_steps || []) : (currentStep.no_steps || []);

    if (branchSteps.length === 0) {
      // Empty branch — skip to next sibling step
      const nextPath = getNextStepPath(steps, effectivePath);
      if (nextPath) {
        const nextStep = resolveStep(steps, nextPath);
        const delay = nextStep?.delay_seconds || 0;
        await scheduleFlowStep(enrollment_id, nextPath, new Date(Date.now() + delay * 1000), enrollment.client_id);
        console.log(`Empty ${branchKey} branch. Skipping to ${nextPath}`);
      } else {
        await supabase
          .from('email_flow_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', enrollment_id);
        console.log(`Empty ${branchKey} branch and no more steps. Flow completed.`);
      }
      return c.json({ branch: branchKey, empty_branch: true });
    }

    // Schedule first step in the chosen branch
    const branchPath = `${effectivePath}.${branchKey}.0`;
    const firstBranchStep = branchSteps[0];
    const delay = firstBranchStep.delay_seconds || 0;

    await scheduleFlowStep(enrollment_id, branchPath, new Date(Date.now() + delay * 1000), enrollment.client_id);
    console.log(`Condition ${conditionMet ? 'met' : 'not met'}. Taking ${branchKey} branch → ${branchPath}`);
    return c.json({ branch: branchKey, next_path: branchPath });
  }

  // ============================================================
  // Handle DELAY step
  // ============================================================
  if (stepType === 'delay') {
    const nextPath = getNextStepPath(steps, effectivePath);
    if (nextPath) {
      const delay = currentStep.delay_seconds || 3600;
      await scheduleFlowStep(enrollment_id, nextPath, new Date(Date.now() + delay * 1000), enrollment.client_id);
      console.log(`Delay step. Scheduling ${nextPath} in ${delay}s`);
    } else {
      await supabase
        .from('email_flow_enrollments')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', enrollment_id);
    }
    return c.json({ delay: true, next_path: nextPath });
  }

  // ============================================================
  // Handle EMAIL step (existing logic + legacy conditions)
  // ============================================================

  // 7. Check legacy step conditions
  if (currentStep.conditions) {
    const conditionMet = await evaluateStepCondition(supabase, subscriber, enrollment, currentStep.conditions);
    if (!conditionMet) {
      console.log(`Step ${effectivePath} conditions not met. Skipping to next.`);
      const nextPath = getNextStepPath(steps, effectivePath);
      if (nextPath) {
        const nextStep = resolveStep(steps, nextPath);
        const delay = nextStep?.delay_seconds || 0;
        await scheduleFlowStep(enrollment_id, nextPath, new Date(Date.now() + delay * 1000), enrollment.client_id);
      } else {
        await supabase
          .from('email_flow_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', enrollment_id);
      }
      return c.json({ skipped_step: true, reason: 'Conditions not met' });
    }
  }

  // 7b. Idempotency check — skip if this step was already sent (Cloud Tasks retry)
  // Only check events created AFTER this enrollment started, to allow re-enrollments
  const { count: alreadySentCount } = await supabase
    .from('email_events')
    .select('*', { count: 'exact', head: true })
    .eq('subscriber_id', subscriber.id)
    .eq('flow_id', flow.id)
    .eq('event_type', 'sent')
    .eq('metadata->>step_path', effectivePath)
    .gte('created_at', enrollment.enrolled_at);

  if (alreadySentCount && alreadySentCount > 0) {
    console.log(`Step ${effectivePath} already sent to ${subscriber.email}. Skipping (idempotency).`);
    // Still schedule the next step in case it wasn't scheduled
    const nextPath = getNextStepPath(steps, effectivePath);
    if (nextPath) {
      const nextStep = resolveStep(steps, nextPath);
      const delay = nextStep?.delay_seconds || 3600;
      await scheduleFlowStep(enrollment_id, nextPath, new Date(Date.now() + delay * 1000), enrollment.client_id);
    }
    return c.json({ skipped: true, reason: 'Already sent (idempotency)' });
  }

  // 8. Send the email
  console.log(`Sending flow email step ${effectivePath} to ${subscriber.email}`);

  const domain = await safeQuerySingleOrDefault<any>(
    supabase
      .from('email_domains')
      .select('domain')
      .eq('client_id', enrollment.client_id)
      .eq('status', 'verified')
      .limit(1)
      .maybeSingle(),
    null,
    'emailFlowExecute.getDomain',
  );

  const fromDomain = domain?.domain || process.env.DEFAULT_FROM_DOMAIN || 'steve.cl';
  const fromEmail = currentStep.from_email || `noreply@${fromDomain}`;
  // Use merchant's business name as sender, not generic "Steve"
  const flowClient = await safeQuerySingleOrDefault<any>(
    supabase.from('clients').select('name, company, logo_url, brand_color, brand_secondary_color, brand_font, website_url, shop_domain').eq('id', enrollment.client_id).maybeSingle(),
    null,
    'emailFlowExecute.getFlowClient',
  );
  const fromName = currentStep.from_name || flowClient?.company || flowClient?.name || 'Steve';

  // Build brand info from client record (enrollment.metadata.brand is rarely populated)
  const clientBrandInfo = {
    name: flowClient?.company || flowClient?.name || '',
    logo_url: flowClient?.logo_url || '',
    color: flowClient?.brand_color || '#000000',
    secondary_color: flowClient?.brand_secondary_color || '#666666',
    font: flowClient?.brand_font || 'Arial, sans-serif',
    shop_url: flowClient?.website_url || (flowClient?.shop_domain ? `https://${flowClient.shop_domain}` : ''),
  };

  let htmlContent = currentStep.html_content || '';
  let subject = currentStep.subject || '';

  htmlContent = replaceMergeTags(htmlContent, subscriber, { ...enrollment.metadata, brand: clientBrandInfo });
  subject = replaceMergeTags(subject, subscriber, enrollment.metadata);

  // Process custom blocks (products, discounts, conditionals) per subscriber
  const hasCustomBlocks = htmlContent.includes('data-steve-') || htmlContent.includes('product_recommendations');
  if (hasCustomBlocks) {
    try {
      const templateCtx = buildTemplateContext(
        {
          first_name: subscriber.first_name,
          last_name: subscriber.last_name,
          email: subscriber.email,
          tags: subscriber.tags || [],
          total_orders: subscriber.total_orders || 0,
          total_spent: subscriber.total_spent || 0,
          last_order_at: subscriber.last_order_at,
          custom_fields: subscriber.custom_fields || {},
        },
        {
          cart_url: enrollment.metadata?.abandoned_checkout_url || enrollment.metadata?.cart_url,
          cart_total: enrollment.metadata?.total_price,
          discount_code: enrollment.metadata?.discount_code,
        },
        { ...clientBrandInfo, ...enrollment.metadata?.brand },
        enrollment.metadata?.products || []
      );

      htmlContent = await processEmailHtml(htmlContent, {
        clientId: enrollment.client_id,
        subscriberId: subscriber.id,
        enrollmentMetadata: enrollment.metadata,
        templateContext: templateCtx,
      });
    } catch (err) {
      console.error(`[flow-engine] processEmailHtml failed, sending with merge-tags only:`, err);
    }
  }

  const result = await sendSingleEmail({
    to: subscriber.email,
    subject,
    htmlContent,
    fromEmail,
    fromName,
    subscriberId: subscriber.id,
    clientId: enrollment.client_id,
    flowId: flow.id,
  });

  if (!result.success) {
    console.error(`Failed to send flow email: ${result.error}`);
    return c.json({ error: result.error }, 500);
  }

  // Tag the sent event with step_path for idempotency checks on Cloud Tasks retries
  if (result.eventId) {
    const evt = await safeQuerySingleOrDefault<any>(
      supabase.from('email_events').select('metadata').eq('id', result.eventId).single(),
      null,
      'emailFlowExecute.getEventMetadata',
    );
    if (evt) {
      await supabase.from('email_events').update({ metadata: { ...evt.metadata, step_path: effectivePath } }).eq('id', result.eventId);
    }
  }

  // 9. Schedule next step
  const nextPath = getNextStepPath(steps, effectivePath);
  if (nextPath) {
    const nextStep = resolveStep(steps, nextPath);
    const delay = nextStep?.delay_seconds || 3600;
    const nextRun = new Date(Date.now() + delay * 1000);

    await supabase
      .from('email_flow_enrollments')
      .update({ next_send_at: nextRun.toISOString() })
      .eq('id', enrollment_id);

    await scheduleFlowStep(enrollment_id, nextPath, nextRun, enrollment.client_id);
    console.log(`Next step ${nextPath} scheduled for ${nextRun.toISOString()}`);
  } else {
    await supabase
      .from('email_flow_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        next_send_at: null,
      })
      .eq('id', enrollment_id);
    console.log(`Enrollment ${enrollment_id} completed all steps.`);
  }

  return c.json({ success: true, step_path: effectivePath, messageId: result.messageId });
}

// ============================================================
// Tree Navigation
// ============================================================

/**
 * Resolve a step in the tree by path string.
 * Path format: "0", "1", "2.yes.0", "2.no.1"
 */
function resolveStep(steps: any[], path: string): any | null {
  const parts = path.split('.');
  let currentArray = steps;
  let step: any = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === 'yes' || part === 'no') {
      // Navigate into branch
      if (!step || step.type !== 'condition') return null;
      currentArray = part === 'yes' ? (step.yes_steps || []) : (step.no_steps || []);
      step = null; // Reset, next part should be an index
    } else {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= currentArray.length) return null;
      step = currentArray[index];
    }
  }

  return step;
}

/**
 * Get the next step path after the current one.
 * Handles flat arrays and nested branches.
 */
function getNextStepPath(steps: any[], currentPath: string): string | null {
  const parts = currentPath.split('.');

  // Try incrementing the last index
  const lastIndex = parseInt(parts[parts.length - 1], 10);
  const nextIndex = lastIndex + 1;

  // Find the containing array
  const parentParts = parts.slice(0, -1);
  const containingArray = getContainingArray(steps, parentParts);

  if (containingArray && nextIndex < containingArray.length) {
    // There's a next sibling in the same array
    return [...parentParts, String(nextIndex)].join('.');
  }

  // No more siblings. If we're inside a branch, go up to parent's next sibling.
  // Path like "2.yes.1" → parent condition is at "2", next would be "3"
  if (parentParts.length >= 2) {
    // Remove the branch key (yes/no) and the condition index to get grandparent
    // "2.yes" → grandparent parts = [], condition at "2", so next = "3"
    const branchKey = parentParts[parentParts.length - 1]; // "yes" or "no"
    if (branchKey === 'yes' || branchKey === 'no') {
      const conditionPath = parentParts.slice(0, -1).join('.');
      // After a condition, continue to the next sibling of the condition
      return getNextStepPath(steps, conditionPath);
    }
  }

  // No more steps at any level
  return null;
}

/**
 * Get the array that contains the step at the given parent path parts.
 */
function getContainingArray(steps: any[], parentParts: string[]): any[] | null {
  if (parentParts.length === 0) return steps;

  let currentArray = steps;
  let step: any = null;

  for (const part of parentParts) {
    if (part === 'yes' || part === 'no') {
      if (!step || step.type !== 'condition') return null;
      currentArray = part === 'yes' ? (step.yes_steps || []) : (step.no_steps || []);
      step = null;
    } else {
      const index = parseInt(part, 10);
      if (isNaN(index) || index >= currentArray.length) return null;
      step = currentArray[index];
    }
  }

  return currentArray;
}

// ============================================================
// Branch Condition Evaluator
// ============================================================

/**
 * Evaluate a branch condition for YES/NO splits.
 */
async function evaluateBranchCondition(
  supabase: any,
  subscriber: any,
  enrollment: any,
  condition: any
): Promise<boolean> {
  if (!condition) return true;

  switch (condition.type) {
    case 'opened_email': {
      const { count } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('subscriber_id', subscriber.id)
        .eq('flow_id', enrollment.flow_id)
        .eq('event_type', 'opened')
        .gte('created_at', enrollment.enrolled_at);
      return (count || 0) > 0;
    }

    case 'clicked_email': {
      const { count } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('subscriber_id', subscriber.id)
        .eq('flow_id', enrollment.flow_id)
        .eq('event_type', 'clicked')
        .gte('created_at', enrollment.enrolled_at);
      return (count || 0) > 0;
    }

    case 'has_purchased': {
      const { count } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('subscriber_id', subscriber.id)
        .eq('event_type', 'converted')
        .gte('created_at', enrollment.enrolled_at);
      return (count || 0) > 0;
    }

    case 'opened_any_email': {
      const days = parseInt(condition.operator || '30', 10);
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const { count } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('subscriber_id', subscriber.id)
        .eq('event_type', 'opened')
        .gte('created_at', since);
      return (count || 0) > 0;
    }

    case 'clicked_any_email': {
      const days = parseInt(condition.operator || '30', 10);
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const { count } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('subscriber_id', subscriber.id)
        .eq('event_type', 'clicked')
        .gte('created_at', since);
      return (count || 0) > 0;
    }

    case 'total_orders': {
      const orderCount = subscriber.total_orders || subscriber.custom_fields?.total_orders || 0;
      return compareValues(orderCount, condition.operator, condition.value);
    }

    case 'total_spent': {
      const totalSpent = subscriber.total_spent || subscriber.custom_fields?.total_spent || 0;
      return compareValues(totalSpent, condition.operator, condition.value);
    }

    case 'last_order_days': {
      const lastOrderAt = subscriber.last_order_at || subscriber.custom_fields?.last_order_at;
      if (!lastOrderAt) return compareValues(999, condition.operator, condition.value);
      const daysSinceOrder = Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86400000);
      return compareValues(daysSinceOrder, condition.operator, condition.value);
    }

    case 'subscriber_property': {
      const fieldValue = subscriber[condition.field] ?? subscriber.custom_fields?.[condition.field];
      return compareValues(fieldValue, condition.operator, condition.value);
    }

    case 'subscriber_tag': {
      const tags = subscriber.tags || subscriber.custom_fields?.tags || [];
      const hasTag = Array.isArray(tags) ? tags.includes(condition.value) : String(tags).includes(condition.value);
      return condition.operator === 'neq' ? !hasTag : hasTag;
    }

    case 'subscriber_source': {
      const source = subscriber.source || '';
      return condition.operator === 'neq' ? source !== condition.value : source === condition.value;
    }

    default:
      return true;
  }
}

function compareValues(fieldValue: any, operator: string, compareValue: any): boolean {
  switch (operator) {
    case 'eq': return fieldValue == compareValue;
    case 'neq': return fieldValue != compareValue;
    case 'gt': return Number(fieldValue) > Number(compareValue);
    case 'gte': return Number(fieldValue) >= Number(compareValue);
    case 'lt': return Number(fieldValue) < Number(compareValue);
    case 'lte': return Number(fieldValue) <= Number(compareValue);
    case 'contains': return String(fieldValue || '').includes(String(compareValue));
    case 'is_null': return fieldValue == null;
    case 'not_null': return fieldValue != null;
    default: return true;
  }
}

// ============================================================
// Flow Management CRUD
// ============================================================

/**
 * Flow management: CRUD for email flows.
 * POST /api/manage-email-flows
 */
export async function manageEmailFlows(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'list': {
      const { data, error } = await supabase
        .from('email_flows')
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });

      if (error) return c.json({ error: error.message }, 500);

      const flowsWithStats = await Promise.all(
        (data || []).map(async (flow) => {
          const { count: activeEnrollments } = await supabase
            .from('email_flow_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('flow_id', flow.id)
            .eq('status', 'active');

          const { count: totalEnrollments } = await supabase
            .from('email_flow_enrollments')
            .select('*', { count: 'exact', head: true })
            .eq('flow_id', flow.id);

          const { count: totalSent } = await supabase
            .from('email_events')
            .select('*', { count: 'exact', head: true })
            .eq('flow_id', flow.id)
            .eq('event_type', 'sent');

          return {
            ...flow,
            active_enrollments: activeEnrollments || 0,
            total_enrollments: totalEnrollments || 0,
            total_sent: totalSent || 0,
          };
        })
      );

      return c.json({ flows: flowsWithStats });
    }

    case 'get': {
      const { flow_id } = body;
      if (!flow_id) return c.json({ error: 'flow_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_flows')
        .select('*')
        .eq('id', flow_id)
        .eq('client_id', client_id)
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ flow: data });
    }

    case 'create': {
      const { name, trigger_type, steps, settings } = body;
      if (!name || !trigger_type) return c.json({ error: 'name and trigger_type are required' }, 400);

      const { data, error } = await supabase
        .from('email_flows')
        .insert({
          client_id,
          name,
          trigger_type,
          steps: steps || [],
          settings: settings || {},
          status: 'draft',
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, flow: data });
    }

    case 'update': {
      const { flow_id, name, steps, settings, status } = body;
      if (!flow_id) return c.json({ error: 'flow_id is required' }, 400);

      const updates: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (steps !== undefined) updates.steps = steps;
      if (settings !== undefined) updates.settings = settings;
      if (status !== undefined) updates.status = status;

      const { data, error } = await supabase
        .from('email_flows')
        .update(updates)
        .eq('id', flow_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, flow: data });
    }

    case 'delete': {
      const { flow_id } = body;
      if (!flow_id) return c.json({ error: 'flow_id is required' }, 400);

      await supabase
        .from('email_flow_enrollments')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('flow_id', flow_id)
        .eq('status', 'active');

      const { error } = await supabase
        .from('email_flows')
        .delete()
        .eq('id', flow_id)
        .eq('client_id', client_id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    case 'activate': {
      const { flow_id } = body;
      if (!flow_id) return c.json({ error: 'flow_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_flows')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', flow_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, flow: data });
    }

    case 'pause': {
      const { flow_id } = body;
      if (!flow_id) return c.json({ error: 'flow_id is required' }, 400);

      const { data, error } = await supabase
        .from('email_flows')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', flow_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);

      // Cancel all pending Cloud Tasks for active enrollments and pause them
      const activeEnrollments = await safeQueryOrDefault<any>(
        supabase
          .from('email_flow_enrollments')
          .select('id, cloud_task_name')
          .eq('flow_id', flow_id)
          .eq('status', 'active'),
        [],
        'manageEmailFlows.getActiveEnrollmentsForPause',
      );

      if (activeEnrollments && activeEnrollments.length > 0) {
        // Try to cancel Cloud Tasks in parallel
        try {
          const { CloudTasksClient } = await import('@google-cloud/tasks');
          const tasksClient = new CloudTasksClient();
          await Promise.allSettled(
            activeEnrollments
              .filter((e: any) => e.cloud_task_name)
              .map((e: any) => tasksClient.deleteTask({ name: e.cloud_task_name }).catch(() => {}))
          );
        } catch (err) {
          console.error('Failed to import/init CloudTasksClient for pause:', err);
        }

        // Pause all active enrollments
        await supabase
          .from('email_flow_enrollments')
          .update({ status: 'paused' })
          .eq('flow_id', flow_id)
          .eq('status', 'active');

        console.log(`Paused ${activeEnrollments.length} enrollments and cancelled their Cloud Tasks for flow ${flow_id}`);
      }

      return c.json({ success: true, flow: data });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

// ============================================================
// Cloud Tasks Scheduling
// ============================================================

/**
 * Schedule a flow step via Google Cloud Tasks.
 * Supports both integer step (legacy) and string step_path (branching).
 */
async function scheduleFlowStep(
  enrollmentId: string,
  stepPath: string | number,
  scheduledAt: Date,
  clientId: string
) {
  try {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    const client = new CloudTasksClient();

    const project = process.env.GCP_PROJECT_ID || 'steveapp-agency';
    const location = process.env.GCP_LOCATION || 'us-central1';
    const queue = process.env.CLOUD_TASKS_QUEUE || 'steve-mail';
    const apiBaseUrl = process.env.API_BASE_URL || 'https://steve-api-850416724643.us-central1.run.app';

    const parent = client.queuePath(project, location, queue);

    const [task] = await client.createTask({
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: `${apiBaseUrl}/api/email-flow-execute`,
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          },
          body: Buffer.from(JSON.stringify({
            enrollment_id: enrollmentId,
            step_path: String(stepPath),
          })).toString('base64'),
        },
        scheduleTime: {
          seconds: Math.floor(scheduledAt.getTime() / 1000),
        },
      },
    });

    if (task?.name) {
      const supabase = getSupabaseAdmin();
      await supabase
        .from('email_flow_enrollments')
        .update({ cloud_task_name: task.name })
        .eq('id', enrollmentId);
    }

    return task;
  } catch (err: any) {
    console.error('Failed to schedule flow step:', err);
    // Don't re-throw — email was already sent, scheduling failure is non-critical
    // Steps can be triggered manually or via fallback mechanism
  }
}

// ============================================================
// Merge Tags
// ============================================================

function replaceMergeTags(content: string, subscriber: any, metadata: any = {}): string {
  // Use Nunjucks engine for full template support ({% if %}, {% for %}, filters)
  const context = buildTemplateContext(
    {
      first_name: subscriber.first_name,
      last_name: subscriber.last_name,
      email: subscriber.email,
      tags: subscriber.tags || [],
      total_orders: subscriber.total_orders || 0,
      total_spent: subscriber.total_spent || 0,
      last_order_at: subscriber.last_order_at,
      custom_fields: subscriber.custom_fields || {},
    },
    {
      cart_url: metadata?.abandoned_checkout_url || metadata?.cart_url,
      cart_total: metadata?.total_price,
      discount_code: metadata?.discount_code,
      unsubscribe_url: metadata?.unsubscribe_url,
    },
    metadata?.brand || {},
    metadata?.products || []
  );

  return renderEmailTemplate(content, context);
}

// ============================================================
// Legacy Step Condition Evaluator
// ============================================================

async function evaluateStepCondition(
  supabase: any,
  subscriber: any,
  enrollment: any,
  conditions: any
): Promise<boolean> {
  if (!conditions) return true;

  if (conditions.opened_previous) {
    const { count } = await supabase
      .from('email_events')
      .select('*', { count: 'exact', head: true })
      .eq('subscriber_id', subscriber.id)
      .eq('flow_id', enrollment.flow_id)
      .eq('event_type', 'opened')
      .gte('created_at', enrollment.enrolled_at);
    return (count || 0) > 0;
  }

  if (conditions.clicked_previous) {
    const { count } = await supabase
      .from('email_events')
      .select('*', { count: 'exact', head: true })
      .eq('subscriber_id', subscriber.id)
      .eq('flow_id', enrollment.flow_id)
      .eq('event_type', 'clicked')
      .gte('created_at', enrollment.enrolled_at);
    return (count || 0) > 0;
  }

  return true;
}
