import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Image,
} from 'react-native';

import { User, Mail, Eye, EyeOff, Building2, Check, X } from 'lucide-react-native';
import { useUser } from '@/hooks/user-context';
import { router } from 'expo-router';
import { RADIUS, SHADOWS, SPACING } from '@/constants/colors';
import { useTheme } from '@/hooks/theme-context';
import { api } from '@/lib/api';
import { handleError } from '@/lib/error-handler';
import { LoadingSpinner } from '@/components/LoadingStates';
import { promotersApi } from '@/lib/supabase-api';

export default function LoginScreen() {
  const [userType, setUserType] = useState<'normal' | 'promoter'>('normal');
  const [logoTapCount, setLogoTapCount] = useState(0);
  const logoTapTimeout = useRef<number | null>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasMinLength = password.length >= 8;
  const isPasswordValid = hasUppercase && hasNumber && hasMinLength;
  const showPasswordStrength = !isLogin && password.length > 0;

  const getStrengthLevel = (): { label: string; color: string; width: number } => {
    const checks = [hasMinLength, hasUppercase, hasNumber].filter(Boolean).length;
    if (checks === 3) return { label: 'Forte', color: '#22c55e', width: 100 };
    if (checks === 2) return { label: 'Média', color: '#f59e0b', width: 66 };
    return { label: 'Fraca', color: '#ef4444', width: 33 };
  };

  
  const { updateUser, savePromoterProfile: savePromoterProfileCtx } = useUser();
  const { colors } = useTheme();
  
  const loginMutation = api.auth.login.useMutation();
  const sendCodeMutation = api.auth.sendVerificationCode.useMutation();

  const handleLogoTap = () => {
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    if (logoTapTimeout.current) clearTimeout(logoTapTimeout.current);
    if (newCount >= 10) {
      setLogoTapCount(0);
      router.push('/admin-login');
    } else {
      logoTapTimeout.current = setTimeout(() => setLogoTapCount(0), 3000) as any;
    }
  };
  
  const saveUser = async (userData: any) => {
    await updateUser(userData);
  };
  
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(logoRotate, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, logoScale, logoRotate]);

  const handleAuth = async () => {
    setErrorMessage('');
    
    // Validation
    if (!email.trim()) {
      setErrorMessage('Por favor, insira um email');
      return;
    }

    if (!password.trim()) {
      setErrorMessage('Por favor, insira uma palavra-passe');
      return;
    }

    if (!isLogin && !name.trim()) {
      setErrorMessage('Por favor, insira o seu nome');
      return;
    }

    if (!isLogin && !isPasswordValid) {
      setErrorMessage('A palavra-passe deve ter pelo menos 8 caracteres, uma letra maiúscula e um número.');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Por favor, insira um email válido');
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        const result = await loginMutation.mutateAsync({
          email: email.trim().toLowerCase(),
          password: password,
        });

        if (result.success && result.user) {
          const serverUserType = result.user.userType as string;
          const isAdmin = serverUserType === 'admin' || result.user.email === 'geral@lyven.pt' || result.user.email === 'info@lyven.pt';

          if (!isAdmin) {
            if (userType === 'promoter' && serverUserType !== 'promoter') {
              setErrorMessage('Esta conta não é de promotor. Selecione "Utilizador" para entrar.');
              setIsLoading(false);
              return;
            }
            if (userType === 'normal' && serverUserType === 'promoter') {
              setErrorMessage('Esta conta é de promotor. Selecione "Promotor" para entrar.');
              setIsLoading(false);
              return;
            }
          }

          const userData = {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            userType: result.user.userType as 'normal' | 'promoter' | 'admin',
            isOnboardingComplete: result.user.isOnboardingComplete === 1,
            phone: result.user.phone || undefined,
            interests: result.user.interests ? JSON.parse(result.user.interests) : [],
            location: result.user.locationLatitude && result.user.locationLongitude ? {
              latitude: result.user.locationLatitude,
              longitude: result.user.locationLongitude,
              city: result.user.locationCity || undefined,
              region: result.user.locationRegion || undefined,
            } : undefined,
            preferences: {
              notifications: result.user.preferencesNotifications === 1,
              emailUpdates: true,
              shareData: false,
              language: result.user.preferencesLanguage || 'pt',
              priceRange: {
                min: result.user.preferencesPriceMin || 0,
                max: result.user.preferencesPriceMax || 1000,
              },
              eventTypes: result.user.preferencesEventTypes ? JSON.parse(result.user.preferencesEventTypes) : [],
            },
            favoriteEvents: result.user.favoriteEvents ? JSON.parse(result.user.favoriteEvents) : [],
            eventHistory: result.user.eventHistory ? JSON.parse(result.user.eventHistory) : [],
            following: {
              promoters: [],
              artists: [],
              friends: [],
            },
            createdAt: result.user.createdAt || new Date().toISOString(),
          };

          await saveUser(userData);

          if (isAdmin) {
            router.replace('/admin-dashboard');
          } else if (serverUserType === 'promoter') {
            try {
              console.log('[Login] Checking promoter approval status for user:', result.user.id);
              const promoterProfile = await promotersApi.getByUserId({ userId: result.user.id });
              console.log('[Login] Promoter profile result:', JSON.stringify(promoterProfile));
              
              if (promoterProfile && promoterProfile.isApproved === true) {
                console.log('[Login] Promoter is approved, saving profile and redirecting to tabs');
                const profileToSave = {
                  id: promoterProfile.id,
                  userId: promoterProfile.userId,
                  companyName: promoterProfile.companyName,
                  description: promoterProfile.description || '',
                  website: promoterProfile.website || '',
                  socialMedia: {
                    instagram: promoterProfile.instagramHandle || '',
                    facebook: promoterProfile.facebookHandle || '',
                    twitter: promoterProfile.twitterHandle || '',
                  },
                  isApproved: true,
                  eventsCreated: [],
                  followers: [],
                  rating: 0,
                  totalEvents: 0,
                };
                await savePromoterProfileCtx(profileToSave);
                console.log('[Login] Promoter profile saved:', profileToSave.id);
                router.replace('/(tabs)');
              } else if (!promoterProfile) {
                console.log('[Login] No promoter profile found, creating one...');
                try {
                  await promotersApi.create({
                    userId: result.user.id,
                    companyName: result.user.name || 'Promotor',
                    description: '',
                  });
                  console.log('[Login] Promoter profile created, redirecting to pending approval');
                } catch (createErr) {
                  console.warn('[Login] Could not create promoter profile:', createErr);
                }
                router.replace('/pending-approval');
              } else {
                console.log('[Login] Promoter profile found but not approved. isApproved:', promoterProfile.isApproved, 'type:', typeof promoterProfile.isApproved);
                router.replace('/pending-approval');
              }
            } catch (err) {
              console.error('[Login] Error checking promoter status:', err);
              router.replace('/pending-approval');
            }
          } else {
            router.replace('/(tabs)');
          }
        } else {
          setErrorMessage('Credenciais inválidas. Verifica o email e palavra-passe.');
        }
      } else {
        // Registration flow
        if (email.toLowerCase() === 'admin' || email.toLowerCase() === 'geral@lyven.pt' || email.toLowerCase() === 'info@lyven.pt') {
          setErrorMessage('Este email não pode ser usado para registo.');
          setIsLoading(false);
          return;
        }

        // Send verification code to email, then navigate to verify screen
        const sendResult = await sendCodeMutation.mutateAsync({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          password,
        });

        if (sendResult?.success) {
          router.push({
            pathname: '/verify-email',
            params: {
              email: email.trim().toLowerCase(),
              name: name.trim(),
              password,
              userType,
            },
          });
        }
      }
    } catch (error) {
      console.error('❌ Erro durante autenticação:', error);
      const errMsg = handleError(error);
      setErrorMessage(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.gradient, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>

            <View style={styles.header}>
                <Animated.View
                  style={[
                    styles.logoContainer,
                    {
                      opacity: logoOpacity,
                      transform: [{ scale: logoScale }],
                    },
                  ]}
                >
                  <TouchableOpacity onPress={handleLogoTap} activeOpacity={1}>
                    <Image
                      source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/r0eawa35sn5kfssq1aek9' }}
                      style={styles.logoImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                </Animated.View>
            </View>

            <View style={styles.form}>
              <View style={styles.userTypeContainer}>
                <TouchableOpacity
                  style={[
                    styles.userTypeButton,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    userType === 'normal' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    setUserType('normal');
                    setIsLogin(true);
                  }}
                >
                  <User size={20} color={userType === 'normal' ? colors.white : colors.primary} />
                  <Text
                    style={[
                      styles.userTypeText,
                      { color: colors.primary },
                      userType === 'normal' && { color: colors.white },
                    ]}
                  >
                    Utilizador
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.userTypeButton,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    userType === 'promoter' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    setUserType('promoter');
                    setIsLogin(true);
                  }}
                >
                  <Building2 size={20} color={userType === 'promoter' ? colors.white : colors.primary} />
                  <Text
                    style={[
                      styles.userTypeText,
                      { color: colors.primary },
                      userType === 'promoter' && { color: colors.white },
                    ]}
                  >
                    Promotor
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Mail size={20} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Email"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {!isLogin && (
                <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <User size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={userType === 'promoter' ? 'Nome do promotor / empresa' : 'Nome completo'}
                    placeholderTextColor={colors.textSecondary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={[styles.inputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.inputIcon}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Palavra-passe"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>

              {showPasswordStrength && (
                <View style={styles.strengthContainer}>
                  <View style={[styles.strengthBarBg, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.strengthBarFill,
                        {
                          backgroundColor: getStrengthLevel().color,
                          width: `${getStrengthLevel().width}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: getStrengthLevel().color }]}>
                    {getStrengthLevel().label}
                  </Text>
                  <View style={styles.requirementsList}>
                    <View style={styles.requirementRow}>
                      {hasMinLength ? <Check size={14} color="#22c55e" /> : <X size={14} color={colors.textSecondary} />}
                      <Text style={[styles.requirementText, { color: hasMinLength ? '#22c55e' : colors.textSecondary }]}>
                        Mínimo 8 caracteres
                      </Text>
                    </View>
                    <View style={styles.requirementRow}>
                      {hasUppercase ? <Check size={14} color="#22c55e" /> : <X size={14} color={colors.textSecondary} />}
                      <Text style={[styles.requirementText, { color: hasUppercase ? '#22c55e' : colors.textSecondary }]}>
                        Uma letra maiúscula
                      </Text>
                    </View>
                    <View style={styles.requirementRow}>
                      {hasNumber ? <Check size={14} color="#22c55e" /> : <X size={14} color={colors.textSecondary} />}
                      <Text style={[styles.requirementText, { color: hasNumber ? '#22c55e' : colors.textSecondary }]}>
                        Um número
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {isLogin && (
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={() => router.push('/forgot-password')}
                >
                  <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Esqueceu a palavra-passe?</Text>
                </TouchableOpacity>
              )}

              {errorMessage ? (
                <View style={[styles.errorContainer, { backgroundColor: colors.error + '15', borderColor: colors.error + '30' }]}>
                  <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }, isLoading && styles.buttonDisabled]}
                onPress={handleAuth}
                disabled={isLoading}
              >
                {isLoading ? (
                  <View style={styles.buttonLoading}>
                    <LoadingSpinner size="small" />
                    <Text style={[styles.buttonText, { color: colors.white, marginLeft: 8 }]}>
                      Aguarde...
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.buttonText, { color: colors.white }]}>
                    {isLogin ? 'Entrar' : 'Criar Conta'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => setIsLogin(!isLogin)}
              >
                <Text style={[styles.switchText, { color: colors.text }]}>
                  {isLogin ? 'Não tem conta? ' : 'Já tem conta? '}
                  <Text style={[styles.switchTextBold, { color: colors.primary }]}>
                    {isLogin ? 'Criar conta' : 'Entrar'}
                  </Text>
                </Text>
              </TouchableOpacity>

              {userType === 'promoter' && !isLogin && (
                <View style={[styles.promoterInfoBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
                  <Building2 size={16} color={colors.primary} />
                  <Text style={[styles.promoterInfoText, { color: colors.textSecondary }]}>
                    A sua conta de promotor ficará pendente de aprovação pelo administrador.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },

  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logoContainer: {
    marginBottom: 30,
    alignItems: 'center',
  },
  logoImage: {
    width: 300,
    height: 120,
  },
  form: {
    width: '100%',
  },
  userTypeContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xxl,
  },
  userTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    height: 56,
    borderWidth: 1.5,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  userTypeText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    ...SHADOWS.sm,
  },
  inputIcon: {
    marginRight: SPACING.md,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as const } : {}),
  } as any,
  button: {
    borderRadius: RADIUS.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
    ...SHADOWS.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  switchButton: {
    marginTop: SPACING.xxxl,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 14,
  },
  switchTextBold: {
    fontWeight: '600' as const,
  },
  promoterInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginTop: SPACING.xxl,
    gap: SPACING.md,
    borderWidth: 1,
  },
  promoterInfoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.sm,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  errorContainer: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center' as const,
  },
  strengthContainer: {
    marginBottom: SPACING.lg,
    gap: 6,
  },
  strengthBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  strengthBarFill: {
    height: '100%' as const,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    textAlign: 'right' as const,
  },
  requirementsList: {
    gap: 4,
    marginTop: 2,
  },
  requirementRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  requirementText: {
    fontSize: 12,
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
