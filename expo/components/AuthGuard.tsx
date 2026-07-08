import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@/hooks/user-context';
import { COLORS } from '@/constants/colors';
import { Lock } from 'lucide-react-native';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loginPromptContainer}>
        <View style={styles.loginPromptCard}>
          <Lock size={40} color={COLORS.primary} />
          <Text style={styles.loginPromptTitle}>Inicie Sessão</Text>
          <Text style={styles.loginPromptText}>
            Esta funcionalidade requer uma conta. Inicie sessão ou crie uma conta para continuar.
          </Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginButtonText}>Entrar / Criar Conta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.browseButtonText}>Explorar Eventos</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!user.isOnboardingComplete) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
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
    backgroundColor: '#000',
  },
  loginPromptContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
  },
  loginPromptCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    width: '100%',
    maxWidth: 360,
  },
  loginPromptTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  loginPromptText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: 24,
  },
  loginButton: {
    backgroundColor: COLORS.primary,
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
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '500' as const,
  },
});