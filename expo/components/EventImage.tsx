import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { useTheme } from '@/hooks/theme-context';

interface EventImageProps {
  uri: string | null | undefined;
  style?: any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}

/**
 * Imagem de evento com fallback: se o URL estiver vazio ou falhar ao carregar,
 * mostra um placeholder temático em vez de um espaço vazio/partido.
 */
export function EventImage({ uri, style, resizeMode = 'cover' }: EventImageProps) {
  const { colors } = useTheme();
  const [hasError, setError] = useState(false);

  const showPlaceholder = !uri || hasError;

  if (showPlaceholder) {
    return (
      <View style={[style, styles.placeholder, { backgroundColor: colors.primaryLight }]}>
        <CalendarDays size={28} color={colors.primary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setError(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EventImage;
