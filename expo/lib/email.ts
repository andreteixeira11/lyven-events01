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
}): Promise<{ success: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: payload,
    });

    if (error) {
      console.warn('[sendEmail] Edge function error:', error?.message);
      return { success: false };
    }

    return { success: data?.success === true };
  } catch (err: any) {
    console.warn('[sendEmail] Failed:', err?.message);
    return { success: false };
  }
}
