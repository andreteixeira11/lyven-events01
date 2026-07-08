import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity, ScrollView, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Ticket, Heart, Sparkles, LogIn, UserPlus, CalendarHeart } from 'lucide-react-native';
import { useUser } from '@/hooks/user-context';
import { useTheme } from '@/hooks/theme-context';
import { router } from 'expo-router';
import { RADIUS, SPACING } from '@/constants/colors';
import LoginSheet from '@/components/LoginSheet';

interface AuthGuardProps {
  children: React.ReactNode;
  title?: string;
  message?: string;
}

export default function AuthGuard({ children, title, message }: AuthGuardProps) {
  const { user, isLoading } = useUser();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [loginSheetVisible, setLoginSheetVisible] = useState(false);
  const [loginSheetMode, setLoginSheetMode] = useState<'login' | 'register'>('login');

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.85)).current;

  React.useEffect(() => {
    if (!user && !isLoading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [user, isLoading, fadeAnim, scaleAnim]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    const features = [
      { icon: Ticket, title: 'Os Meus Bilhetes', desc: 'Aceda aos seus bilhetes e códigos QR' },
      { icon: Heart, title: 'Favoritos', desc: 'Guarde os seus eventos preferidos' },
      { icon: CalendarHeart, title: 'Calendário', desc: 'Acompanhe eventos que vai comparecer' },
      { icon: Sparkles, title: 'Recomendações', desc: 'Personalizadas segundo os seus gostos' },
    ];

    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} bounces={false}>
          {/* Hero card */}
          <Animated.View
            style={[
              styles.guestHero,
              { backgroundColor: colors.primary },
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            <View style={styles.guestAvatar}>
              <Lock size={36} color={colors.primary} />
            </View>
            <Text style={styles.guestHeroTitle}>{title ?? 'Inicie Sessão'}</Text>
            <Text style={styles.guestHeroSubtitle}>
              {message ??
                'Inicie sessão ou crie uma conta para aceder aos seus bilhetes, favoritos e mais.'}
            </Text>
          </Animated.View>

          {/* Feature list */}
          <View style={styles.guestFeatures}>
            {features.map((f) => (
              <Animated.View
                key={f.title}
                style={[
                  styles.guestFeatureCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  { opacity: fadeAnim },
                ]}
              >
                <View style={[styles.guestFeatureIcon, { backgroundColor: colors.primary + '15' }]}>
                  <f.icon size={22} color={colors.primary} />
                </View>
                <View style={styles.guestFeatureText}>
                  <Text style={[styles.guestFeatureTitle, { color: colors.text }]}>{f.title}</Text>
                  <Text style={[styles.guestFeatureDesc, { color: colors.textSecondary }]}>
                    {f.desc}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* CTA buttons */}
          <View style={styles.guestCTA}>
            <TouchableOpacity
              style={[styles.guestLoginButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setLoginSheetMode('login');
                setLoginSheetVisible(true);
              }}
              activeOpacity={0.85}
            >
              <LogIn size={20} color={colors.white} />
              <Text style={[styles.guestLoginText, { color: colors.white }]}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.guestRegisterButton, { borderColor: colors.primary }]}
              onPress={() => {
                setLoginSheetMode('register');
                setLoginSheetVisible(true);
              }}
              activeOpacity={0.85}
            >
              <UserPlus size={20} color={colors.primary} />
              <Text style={[styles.guestRegisterText, { color: colors.primary }]}>Criar Conta</Text>
            </TouchableOpacity>
          </View>

          {/* Browse without account */}
          <TouchableOpacity
            style={styles.guestBrowseLink}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={[styles.guestBrowseText, { color: colors.textSecondary }]}>
              Continuar a explorar sem conta
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <LoginSheet
          visible={loginSheetVisible}
          onClose={() => setLoginSheetVisible(false)}
          initialMode={loginSheetMode}
        />
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
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  guestHero: {
    alignItems: 'center',
    padding: 28,
    paddingTop: 36,
    paddingBottom: 32,
    borderBottomLeftRadius: RADIUS.xxl,
    borderBottomRightRadius: RADIUS.xxl,
  },
  guestAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  guestHeroTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 8,
  },
  guestHeroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center' as const,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  guestFeatures: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    gap: SPACING.md,
  },
  guestFeatureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    gap: SPACING.md,
  },
  guestFeatureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestFeatureText: {
    flex: 1,
  },
  guestFeatureTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  guestFeatureDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  guestCTA: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
  },
  guestLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    height: 52,
    gap: SPACING.sm,
  },
  guestLoginText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  guestRegisterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    height: 52,
    borderWidth: 2,
    gap: SPACING.sm,
  },
  guestRegisterText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  guestBrowseLink: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  guestBrowseText: {
    fontSize: 13,
  },
});
