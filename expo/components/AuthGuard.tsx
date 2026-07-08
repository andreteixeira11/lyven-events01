import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@/hooks/user-context';
import { useTheme } from '@/hooks/theme-context';
import { Lock } from 'lucide-react-native';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useUser();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.loginPromptContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.loginPromptCard, { backgroundColor: colors.card }]}>
          <Lock size={40} color={colors.primary} />
          <Text style={[styles.loginPromptTitle, { color: colors.text }]}>Inicie Sessão</Text>
          <Text style={[styles.loginPromptText, { color: colors.textSecondary }]}>
            Esta funcionalidade requer uma conta. Inicie sessão ou crie uma conta para continuar.
          </Text>
          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginButtonText}>Entrar / Criar Conta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={[styles.browseButtonText, { color: colors.primary }]}>Explorar Eventos</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!user.isOnboardingComplete) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginPromptContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loginPromptCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 20,
    width: '100%',
    maxWidth: 360,
  },
  loginPromptTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  loginPromptText: {
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: 24,
  },
  loginButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 9999,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  browseButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  browseButtonText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
});
