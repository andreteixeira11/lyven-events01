import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '@/lib/api';

interface ValidatableBuyer {
  id: string;
  name: string;
  quantity: number;
  ticketType: string;
}

/**
 * Validação manual de um bilhete pelo promotor (ex.: o comprador não tem o QR).
 * Usa a mesma RPC atómica do leitor de QR, por isso nunca conta a entrada duas vezes.
 */
export function useManualValidation(eventId: string | undefined) {
  const queryClient = useQueryClient();
  const [validatingId, setValidatingId] = useState<string | null>(null);

  const runValidation = useCallback(async (buyer: ValidatableBuyer) => {
    if (!eventId) return;
    setValidatingId(buyer.id);
    try {
      const result = await ticketsApi.validate({ ticketId: buyer.id, eventId });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(
          result.valid ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
        ).catch(() => {});
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analytics', 'eventStats'] }),
        queryClient.invalidateQueries({ queryKey: ['tickets', 'validationStats'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics', 'buyerHistory'] }),
      ]);
      Alert.alert(result.valid ? 'Entrada validada' : 'Não foi possível validar', result.message);
    } catch (err) {
      console.error('[useManualValidation] error:', err);
      Alert.alert('Erro', 'Não foi possível validar o bilhete. Tente novamente.');
    } finally {
      setValidatingId(null);
    }
  }, [eventId, queryClient]);

  const confirmValidation = useCallback((buyer: ValidatableBuyer) => {
    const message = `${buyer.name}\n${buyer.quantity}× ${buyer.ticketType}\n\nConfirma que esta pessoa está a entrar no evento? Esta ação não pode ser desfeita.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) void runValidation(buyer);
      return;
    }
    Alert.alert('Validar entrada', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Validar', onPress: () => void runValidation(buyer) },
    ]);
  }, [runValidation]);

  return { confirmValidation, validatingId };
}
