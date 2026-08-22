import { supabase } from './supabase';

/**
 * Sends an email via the Supabase Edge Function `send-email`.
 * All email types are handled by a single edge function.
 */
export async function sendEmail(payload: {
  type: string;
  email?: string;
  name?: string;
  subject?: string;
  content?: string;
  code?: string;
  promoterName?: string;
  promoterEmail?: string;
  eventTitle?: string;
  eventDate?: string;
  venueName?: string;
  category?: string;
  adTitle?: string;
  adType?: string;
  budget?: number;
  preferences?: Record<string, boolean>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[sendEmail] Invoking send-email edge function with type:', payload.type, 'to:', payload.email);
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: payload,
    });

    if (error) {
      console.warn('[sendEmail] Edge function invocation error:', error?.message, error);
      return { success: false, error: error?.message || 'Erro ao invocar função de envio de email' };
    }

    console.log('[sendEmail] Edge function response:', data);

    if (data?.error) {
      console.warn('[sendEmail] Edge function returned error:', data.error);
      return { success: false, error: data.error };
    }

    return { success: data?.success === true };
  } catch (err: any) {
    console.warn('[sendEmail] Failed:', err?.message, err);
    return { success: false, error: err?.message || 'Erro ao enviar email' };
  }
}
