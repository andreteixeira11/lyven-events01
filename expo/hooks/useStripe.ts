import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useQuery, useMutation } from '@tanstack/react-query';
import { stripeApi, StripeCheckoutItem } from '@/lib/supabase-api';

/** Item único (compatibilidade com botões de compra pontual). */
export interface CheckoutOptions {
  eventId: string;
  eventTitle: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  pricePerTicket: number;
  userId: string;
  userEmail: string;
}

const NATIVE_RETURN_URL = 'lyven://stripe-return';

function buildReturnUrls(): { returnUrl: string; cancelUrl: string } {
  if (Platform.OS === 'web') {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return { returnUrl: `${origin}/checkout`, cancelUrl: `${origin}/checkout` };
  }
  return { returnUrl: NATIVE_RETURN_URL, cancelUrl: NATIVE_RETURN_URL };
}

export function useStripe() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ['stripe', 'getConfig'],
    queryFn: () => stripeApi.getConfig(),
    staleTime: 1000 * 60 * 5,
  });

  const createCheckoutMutation = useMutation({ mutationFn: stripeApi.createCheckout });

  const isConfigured = configQuery.data?.isConfigured ?? false;
  const publishableKey = configQuery.data?.publishableKey ?? null;

  /** Cria a sessão de checkout e abre a página de pagamento hospedada do Stripe. */
  const createCheckoutSession = useCallback(async (options: CheckoutOptions | { items: StripeCheckoutItem[]; userId: string; userEmail: string; paymentMethod: 'card' | 'mbway' | 'multibanco' }) => {
    setIsLoading(true);
    setError(null);

    try {
      const { returnUrl, cancelUrl } = buildReturnUrls();
      const items: StripeCheckoutItem[] = 'items' in options
        ? options.items
        : [{ eventId: options.eventId, ticketTypeId: options.ticketTypeId, quantity: options.quantity }];

      const result = await createCheckoutMutation.mutateAsync({
        items,
        userId: options.userId,
        userEmail: options.userEmail,
        paymentMethod: 'paymentMethod' in options ? options.paymentMethod : 'card',
        returnUrl,
        cancelUrl,
      });

      if (Platform.OS === 'web') {
        window.location.href = result.url;
      } else {
        await WebBrowser.openAuthSessionAsync(result.url, NATIVE_RETURN_URL);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create checkout session';
      console.error('[useStripe] checkout error:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [createCheckoutMutation]);

  return {
    isConfigured,
    publishableKey,
    isLoading: isLoading || configQuery.isLoading,
    error,
    createCheckoutSession,
    getStatus: stripeApi.getStatus,
    clearError: () => setError(null),
  };
}


