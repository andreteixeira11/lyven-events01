import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Platform, Animated, Image, KeyboardAvoidingView } from "react-native";
import { useCart } from "@/hooks/cart-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { stripeApi } from "@/lib/supabase-api";
import * as WebBrowser from 'expo-web-browser';
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { LoadingSpinner, ErrorState } from "@/components/LoadingStates";
import { handleError } from "@/lib/error-handler";
import { CreditCard, CheckCircle, X, Phone, Building2, ShoppingCart, ChevronRight, Shield, Lock, Ticket, Calendar, MapPin, Minus, Plus, Trash2, ArrowLeft, Check, Armchair } from "lucide-react-native";
import * as Haptics from 'expo-haptics';
import { useUser } from "@/hooks/user-context";
import { useTheme } from "@/hooks/theme-context";
import { RADIUS, SHADOWS, SPACING } from "@/constants/colors";
import { useQueryClient } from '@tanstack/react-query';
import BackButton from '@/components/BackButton';
import LoginSheet from '@/components/LoginSheet';
import { calculateCartCommission, COMMISSION_TIERS_DESCRIPTION } from '@/utils/commission';

type PaymentMethod = 'card' | 'mbway' | 'multibanco';
type CheckoutStep = 'review' | 'payment' | 'confirm';

export default function CheckoutScreen() {
  const { cartItems, getTotalPrice, clearCart, removeFromCart, updateQuantity } = useCart();
  const { user } = useUser();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('review');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('card');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showLoginSheet, setShowLoginSheet] = useState(false);

  // Regresso do Stripe na web: ?session_id=... na própria página.
  const params = useLocalSearchParams<{ session_id?: string; stripe_cancel?: string }>();
  const webReturnHandledRef = useRef(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;

  const steps: CheckoutStep[] = ['review', 'payment', 'confirm'];
  const stepIndex = steps.indexOf(currentStep);

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: stepIndex,
      useNativeDriver: false,
      friction: 8,
    }).start();
  }, [stepIndex, progressAnim]);

  const animateStepChange = useCallback((newStep: CheckoutStep) => {
    setCurrentStep(newStep);
  }, []);

  const { data: eventsData, isLoading: isLoadingEvents, error: eventsError, refetch: refetchEvents } = api.events.list.useQuery(
    {},
    { enabled: cartItems.length > 0 }
  );

  const eventMap = useMemo(() => {
    if (!eventsData) return new Map<string, any>();
    const map = new Map<string, any>();
    eventsData.forEach((e: any) => {
      map.set(e.id, {
        ...e,
        date: new Date(e.date),
        endDate: e.endDate ? new Date(e.endDate) : undefined,
        venue: typeof e.venue === 'object' && e.venue ? e.venue : { id: '', name: '', address: '', city: '', capacity: 0 },
        promoter: typeof e.promoter === 'object' && e.promoter ? e.promoter : { id: '', name: '', image: '', description: '', verified: false, followersCount: 0 },
      });
    });
    return map;
  }, [eventsData]);

  const getEventById = (id: string) => eventMap.get(id);
  const getTicketType = (eventId: string, ticketTypeId: string) => {
    const event = getEventById(eventId);
    return event?.ticketTypes?.find((t: any) => t.id === ticketTypeId);
  };

  const subtotal = getTotalPrice();
  const serviceFee = calculateCartCommission(cartItems);
  const total = subtotal + serviceFee;

  const handleNextStep = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (currentStep === 'review') {
      if (cartItems.length === 0) {
        Alert.alert('Carrinho Vazio', 'Adicione bilhetes ao carrinho para continuar.');
        return;
      }
      animateStepChange('payment');
    } else if (currentStep === 'payment') {
      animateStepChange('confirm');
    }
  };

  const handlePreviousStep = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (currentStep === 'payment') {
      animateStepChange('review');
    } else if (currentStep === 'confirm') {
      animateStepChange('payment');
    }
  };

  const finishPurchase = () => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    clearCart();
    void queryClient.invalidateQueries({ queryKey: ['tickets', 'list'] });
    Animated.spring(successScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
    }).start();
    setShowSuccessModal(true);
  };

  // Confirma o pagamento junto do servidor (a emissão de bilhetes acontece no
  // webhook do Stripe, que pode demorar alguns segundos).
  const verifyPayment = async (sessionId: string): Promise<boolean> => {
    setIsVerifying(true);
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const status = await stripeApi.getStatus({ sessionId });
          if (status?.paid) return true;
        } catch (err) {
          console.warn('[checkout] Falha ao consultar estado do pagamento:', err);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePurchase = async () => {
    if (!user) {
      setShowLoginSheet(true);
      return;
    }
    if (cartItems.length === 0) return;

    setIsProcessing(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      // Nativo: regressa via deep link. Web: regressa a esta página com ?session_id=...
      const returnUrl = Platform.OS === 'web'
        ? `${window.location.origin}/checkout`
        : 'lyven://stripe-return';

      const result = await stripeApi.createCheckout({
        items: cartItems.map(item => ({
          eventId: item.eventId,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          seatLabels: item.seatLabels,
        })),
        userId: user.id,
        userEmail: user.email ?? '',
        paymentMethod: selectedPayment,
        returnUrl,
        cancelUrl: returnUrl,
      });
      setIsProcessing(false);

      if (Platform.OS === 'web') {
        window.location.href = result.url;
        return;
      }

      const browserResult = await WebBrowser.openAuthSessionAsync(result.url, 'lyven://stripe-return');
      let sessionId = result.sessionId;
      if (browserResult.type === 'success' && browserResult.url) {
        const match = browserResult.url.match(/session_id=([^&]+)/);
        if (match) sessionId = decodeURIComponent(match[1]);
      }

      const paid = await verifyPayment(sessionId);
      if (paid) {
        finishPurchase();
      } else {
        Alert.alert(
          'Pagamento não confirmado',
          'Ainda não recebemos a confirmação do pagamento. Se já efetuou o pagamento (ex.: referência Multibanco), os bilhetes aparecerão automaticamente em "Os Meus Bilhetes" após a confirmação.'
        );
      }
    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      setIsProcessing(false);
      setIsVerifying(false);
      Alert.alert('Erro', error instanceof Error ? error.message : 'Ocorreu um erro ao iniciar o pagamento. Por favor, tente novamente.');
    }
  };

  // Regresso do Stripe na web: confirma automaticamente a compra.
  useEffect(() => {
    if (
      Platform.OS === 'web' &&
      typeof params.session_id === 'string' &&
      params.session_id &&
      !webReturnHandledRef.current
    ) {
      webReturnHandledRef.current = true;
      verifyPayment(params.session_id).then(paid => {
        if (paid) {
          finishPurchase();
        }
      });
    }
  }, [params.session_id]);

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    router.dismissAll();
    router.push('/my-tickets');
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('pt-PT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderStepIndicator = () => {
    const progressWidth = progressAnim.interpolate({
      inputRange: [0, 1, 2],
      outputRange: ['0%', '50%', '100%'],
    });

    return (
      <View style={[styles.stepIndicator, { backgroundColor: colors.card }]}>
        <View style={styles.stepLabels}>
          {['Resumo', 'Pagamento', 'Confirmar'].map((label, index) => (
            <TouchableOpacity 
              key={label} 
              style={styles.stepLabel}
              disabled={index > stepIndex}
              onPress={() => index < stepIndex && animateStepChange(steps[index])}
            >
              <View style={[
                styles.stepDot,
                { 
                  backgroundColor: index <= stepIndex ? colors.primary : colors.border,
                  borderColor: index <= stepIndex ? colors.primary : colors.border,
                }
              ]}>
                {index < stepIndex ? (
                  <Check size={12} color={colors.white} strokeWidth={3} />
                ) : (
                  <Text style={[
                    styles.stepNumber,
                    { color: index <= stepIndex ? colors.white : colors.textSecondary }
                  ]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text style={[
                styles.stepText,
                { color: index <= stepIndex ? colors.primary : colors.textSecondary }
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View 
            style={[
              styles.progressBar, 
              { backgroundColor: colors.primary, width: progressWidth }
            ]} 
          />
        </View>
      </View>
    );
  };

  const renderReviewStep = () => (
    <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
      {cartItems.length === 0 ? (
        <View style={styles.emptyCart}>
          <View style={[styles.emptyCartIcon, { backgroundColor: colors.primaryLight }]}>
            <ShoppingCart size={48} color={colors.primary} />
          </View>
          <Text style={[styles.emptyCartTitle, { color: colors.text }]}>
            Carrinho Vazio
          </Text>
          <Text style={[styles.emptyCartText, { color: colors.textSecondary }]}>
            Ainda não adicionou nenhum bilhete ao carrinho
          </Text>
          <TouchableOpacity 
            style={[styles.browseButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.browseButtonText, { color: colors.white }]}>
              Explorar Eventos
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Os seus bilhetes ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})
          </Text>
          
          {cartItems.map((item) => {
            const event = getEventById(item.eventId);
            const ticketType = getTicketType(item.eventId, item.ticketTypeId);
            if (!event || !ticketType) return null;

            return (
              <View 
                key={`${item.eventId}-${item.ticketTypeId}`} 
                style={[styles.ticketCard, { backgroundColor: colors.card }, SHADOWS.md]}
              >
                <Image source={{ uri: event.image }} style={styles.ticketImage} />
                <View style={styles.ticketContent}>
                  <View style={styles.ticketHeader}>
                    <Text style={[styles.ticketTitle, { color: colors.text }]} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => removeFromCart(item.eventId, item.ticketTypeId)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Trash2 size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.ticketMeta}>
                    <View style={styles.ticketMetaItem}>
                      <Calendar size={12} color={colors.textSecondary} />
                      <Text style={[styles.ticketMetaText, { color: colors.textSecondary }]}>
                        {formatDate(event.date)}
                      </Text>
                    </View>
                    <View style={styles.ticketMetaItem}>
                      <MapPin size={12} color={colors.textSecondary} />
                      <Text style={[styles.ticketMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {event.venue.name}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.ticketTypeTag, { backgroundColor: colors.primaryLight }]}>
                    <Ticket size={12} color={colors.primary} />
                    <Text style={[styles.ticketTypeText, { color: colors.primary }]}>
                      {ticketType.name}
                    </Text>
                  </View>

                  {item.seatLabels && item.seatLabels.length > 0 && (
                    <View style={[styles.ticketTypeTag, { backgroundColor: colors.primaryLight, marginTop: 6 }]}>
                      <Armchair size={12} color={colors.primary} />
                      <Text style={[styles.ticketTypeText, { color: colors.primary }]} numberOfLines={2}>
                        Lugares: {item.seatLabels.join(', ')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.ticketFooter}>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity 
                        style={[styles.quantityButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => updateQuantity(item.eventId, item.ticketTypeId, item.quantity - 1)}
                      >
                        <Minus size={14} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={[styles.quantityText, { color: colors.text }]}>{item.quantity}</Text>
                      <TouchableOpacity 
                        style={[styles.quantityButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => {
                          const tt = getTicketType(item.eventId, item.ticketTypeId);
                          const maxAllowed = tt?.active === false ? 0 : (tt?.maxPerPerson ?? 4);
                          const maxAvailable = tt?.available ?? maxAllowed;
                          const limit = Math.min(maxAllowed, maxAvailable);
                          if (item.quantity < limit) {
                            updateQuantity(item.eventId, item.ticketTypeId, item.quantity + 1);
                          } else {
                            Alert.alert('Limite atingido', `Máximo de ${limit} bilhetes deste tipo.`);
                          }
                        }}
                        disabled={(() => {
                          const tt = getTicketType(item.eventId, item.ticketTypeId);
                          const maxAllowed = tt?.active === false ? 0 : (tt?.maxPerPerson ?? 4);
                          const maxAvailable = tt?.available ?? maxAllowed;
                          return item.quantity >= Math.min(maxAllowed, maxAvailable);
                        })()}
                      >
                        <Plus size={14} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.ticketPrice, { color: colors.primary }]}>
                      €{(item.price * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          <View style={[styles.priceBreakdown, { backgroundColor: colors.card }, SHADOWS.sm]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Subtotal</Text>
              <Text style={[styles.priceValue, { color: colors.text }]}>€{subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Taxa de Serviço</Text>
              <Text style={[styles.priceValue, { color: colors.text }]}>€{serviceFee.toFixed(2)}</Text>
            </View>
            <Text style={[styles.feeNote, { color: colors.textSecondary }]}>
              {COMMISSION_TIERS_DESCRIPTION}
            </Text>
            <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.totalValue, { color: colors.primary }]}>€{total.toFixed(2)}</Text>
            </View>
          </View>
        </>
      )}
    </Animated.View>
  );

  const renderPaymentStep = () => (
    <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Método de Pagamento
      </Text>

      <TouchableOpacity 
        style={[
          styles.paymentOption, 
          { backgroundColor: colors.card, borderColor: colors.border },
          selectedPayment === 'card' && { borderColor: colors.primary, borderWidth: 2 }
        ]}
        onPress={() => setSelectedPayment('card')}
      >
        <View style={[styles.paymentIconWrapper, { backgroundColor: selectedPayment === 'card' ? colors.primaryLight : colors.background }]}>
          <CreditCard size={24} color={selectedPayment === 'card' ? colors.primary : colors.textSecondary} />
        </View>
        <View style={styles.paymentInfo}>
          <Text style={[styles.paymentTitle, { color: colors.text }]}>Cartão</Text>
          <Text style={[styles.paymentSubtitle, { color: colors.textSecondary }]}>Visa, Mastercard, American Express</Text>
        </View>
        <View style={[
          styles.radioOuter, 
          { borderColor: selectedPayment === 'card' ? colors.primary : colors.border }
        ]}>
          {selectedPayment === 'card' && (
            <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[
          styles.paymentOption, 
          { backgroundColor: colors.card, borderColor: colors.border },
          selectedPayment === 'mbway' && { borderColor: colors.primary, borderWidth: 2 }
        ]}
        onPress={() => setSelectedPayment('mbway')}
      >
        <View style={[styles.paymentIconWrapper, { backgroundColor: selectedPayment === 'mbway' ? colors.primaryLight : colors.background }]}>
          <Phone size={24} color={selectedPayment === 'mbway' ? colors.primary : colors.textSecondary} />
        </View>
        <View style={styles.paymentInfo}>
          <Text style={[styles.paymentTitle, { color: colors.text }]}>MB WAY</Text>
          <Text style={[styles.paymentSubtitle, { color: colors.textSecondary }]}>Pagamento instantâneo</Text>
        </View>
        <View style={[
          styles.radioOuter, 
          { borderColor: selectedPayment === 'mbway' ? colors.primary : colors.border }
        ]}>
          {selectedPayment === 'mbway' && (
            <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[
          styles.paymentOption, 
          { backgroundColor: colors.card, borderColor: colors.border },
          selectedPayment === 'multibanco' && { borderColor: colors.primary, borderWidth: 2 }
        ]}
        onPress={() => setSelectedPayment('multibanco')}
      >
        <View style={[styles.paymentIconWrapper, { backgroundColor: selectedPayment === 'multibanco' ? colors.primaryLight : colors.background }]}>
          <Building2 size={24} color={selectedPayment === 'multibanco' ? colors.primary : colors.textSecondary} />
        </View>
        <View style={styles.paymentInfo}>
          <Text style={[styles.paymentTitle, { color: colors.text }]}>Multibanco</Text>
          <Text style={[styles.paymentSubtitle, { color: colors.textSecondary }]}>Referência para pagamento</Text>
        </View>
        <View style={[
          styles.radioOuter, 
          { borderColor: selectedPayment === 'multibanco' ? colors.primary : colors.border }
        ]}>
          {selectedPayment === 'multibanco' && (
            <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
          )}
        </View>
      </TouchableOpacity>

      {selectedPayment === 'card' && (
        <View style={[styles.paymentForm, { backgroundColor: colors.card }, SHADOWS.sm]}>
          <View style={styles.infoBox}>
            <Lock size={16} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Será aberta uma página de pagamento segura do Stripe para inserir os dados do cartão. Aceitamos Visa, Mastercard, Apple Pay e Google Pay.
            </Text>
          </View>
        </View>
      )}

      {selectedPayment === 'mbway' && (
        <View style={[styles.paymentForm, { backgroundColor: colors.card }, SHADOWS.sm]}>
          <View style={styles.infoBox}>
            <Phone size={16} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Será aberta uma página segura do Stripe onde insere o seu número de telemóvel e confirma o pagamento na app MB WAY.
            </Text>
          </View>
        </View>
      )}

      {selectedPayment === 'multibanco' && (
        <View style={[styles.paymentForm, { backgroundColor: colors.card }, SHADOWS.sm]}>
          <View style={styles.infoBox}>
            <Building2 size={16} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Será gerada uma referência Multibanco via Stripe. Pode pagar em qualquer Multibanco ou homebanking — os bilhetes ficam disponíveis automaticamente após o pagamento.
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.priceBreakdown, { backgroundColor: colors.card }, SHADOWS.sm]}>
        <View style={styles.priceRow}>
          <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Subtotal</Text>
          <Text style={[styles.priceValue, { color: colors.text }]}>€{subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Taxa de Serviço</Text>
          <Text style={[styles.priceValue, { color: colors.text }]}>€{serviceFee.toFixed(2)}</Text>
        </View>
        <Text style={[styles.feeNote, { color: colors.textSecondary }]}>
          {COMMISSION_TIERS_DESCRIPTION}
        </Text>
        <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
          <Text style={[styles.totalValue, { color: colors.primary }]}>€{total.toFixed(2)}</Text>
        </View>
      </View>

      <View style={[styles.securityBadge, { backgroundColor: colors.card }]}>
        <Shield size={16} color={colors.success} />
        <Text style={[styles.securityText, { color: colors.textSecondary }]}>
          Pagamento seguro com encriptação SSL
        </Text>
        <Lock size={14} color={colors.success} />
      </View>
    </Animated.View>
  );

  const renderConfirmStep = () => (
    <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Confirmar Compra
      </Text>

      <View style={[styles.summaryCard, { backgroundColor: colors.card }, SHADOWS.md]}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>Resumo do Pedido</Text>
        
        {cartItems.map((item) => {
          const event = getEventById(item.eventId);
          const ticketType = getTicketType(item.eventId, item.ticketTypeId);
          if (!event || !ticketType) return null;

          return (
            <View key={`${item.eventId}-${item.ticketTypeId}`} style={[styles.summaryItem, { borderBottomColor: colors.border }]}>
              <View style={styles.summaryItemLeft}>
                <Text style={[styles.summaryItemTitle, { color: colors.text }]} numberOfLines={1}>
                  {event.title}
                </Text>
                <Text style={[styles.summaryItemSub, { color: colors.textSecondary }]}>
                  {ticketType.name} × {item.quantity}
                </Text>
              </View>
              <Text style={[styles.summaryItemPrice, { color: colors.text }]}>
                €{(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
          );
        })}

        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Subtotal</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>€{subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Taxa de Serviço</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>€{serviceFee.toFixed(2)}</Text>
        </View>
        <Text style={[styles.feeNote, { color: colors.textSecondary }]}>
          {COMMISSION_TIERS_DESCRIPTION}
        </Text>
        <View style={[styles.summaryTotalRow, { borderTopColor: colors.primary }]}>
          <Text style={[styles.summaryTotalLabel, { color: colors.text }]}>Total a Pagar</Text>
          <Text style={[styles.summaryTotalValue, { color: colors.primary }]}>€{total.toFixed(2)}</Text>
        </View>
      </View>

      <View style={[styles.paymentSummary, { backgroundColor: colors.card }, SHADOWS.sm]}>
        <Text style={[styles.paymentSummaryTitle, { color: colors.text }]}>Método de Pagamento</Text>
        <View style={styles.paymentSummaryContent}>
          {selectedPayment === 'card' && (
            <>
              <CreditCard size={20} color={colors.primary} />
              <Text style={[styles.paymentSummaryText, { color: colors.textSecondary }]}>
                Cartão de crédito/débito (via Stripe)
              </Text>
            </>
          )}
          {selectedPayment === 'mbway' && (
            <>
              <Phone size={20} color={colors.primary} />
              <Text style={[styles.paymentSummaryText, { color: colors.textSecondary }]}>
                MB WAY (via Stripe)
              </Text>
            </>
          )}
          {selectedPayment === 'multibanco' && (
            <>
              <Building2 size={20} color={colors.primary} />
              <Text style={[styles.paymentSummaryText, { color: colors.textSecondary }]}>
                Referência Multibanco (via Stripe)
              </Text>
            </>
          )}
        </View>
      </View>

      <Text style={[styles.termsText, { color: colors.textSecondary }]}>
        Ao finalizar a compra, concorda com os nossos{' '}
        <Text style={{ color: colors.primary }}>Termos de Serviço</Text> e{' '}
        <Text style={{ color: colors.primary }}>Política de Privacidade</Text>.
      </Text>
    </Animated.View>
  );

  if (cartItems.length > 0 && isLoadingEvents) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Checkout', headerShown: true, headerStyle: { backgroundColor: colors.primary }, headerTintColor: colors.white }} />
        <LoadingSpinner message="A carregar eventos..." />
      </View>
    );
  }
  if (cartItems.length > 0 && eventsError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Checkout', headerShown: true, headerStyle: { backgroundColor: colors.primary }, headerTintColor: colors.white }} />
        <ErrorState message={handleError(eventsError)} onRetry={() => refetchEvents()} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen 
        options={{
          title: 'Checkout',
          headerShown: true,
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '600' as const },
          headerLeft: () => (
            <BackButton onPress={() => currentStep === 'review' ? router.back() : handlePreviousStep()} color={colors.white} backgroundColor="{rgba(0,0,0,0.2)}" />
          ),
        }} 
      />
      
      {renderStepIndicator()}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {currentStep === 'review' && renderReviewStep()}
          {currentStep === 'payment' && renderPaymentStep()}
          {currentStep === 'confirm' && renderConfirmStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {cartItems.length > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={styles.footerPrice}>
            <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>Total</Text>
            <Text style={[styles.footerTotal, { color: colors.primary }]}>€{total.toFixed(2)}</Text>
          </View>
          <TouchableOpacity 
            style={[
              styles.footerButton, 
              { backgroundColor: colors.primary },
              (isProcessing || isVerifying) && styles.footerButtonDisabled
            ]}
            onPress={currentStep === 'confirm' ? handlePurchase : handleNextStep}
            disabled={isProcessing || isVerifying}
          >
            {isProcessing || isVerifying ? (
              <Text style={[styles.footerButtonText, { color: colors.white }]}>
                {isVerifying ? 'A confirmar pagamento...' : 'A processar...'}
              </Text>
            ) : (
              <>
                <Text style={[styles.footerButtonText, { color: colors.white }]}>
                  {currentStep === 'confirm' ? 'Confirmar Pagamento' : 'Continuar'}
                </Text>
                {currentStep !== 'confirm' && <ChevronRight size={20} color={colors.white} />}
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <LoginSheet 
        visible={showLoginSheet} 
        onClose={() => setShowLoginSheet(false)} 
      />

      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.successModal, 
              { backgroundColor: colors.card },
              { transform: [{ scale: successScaleAnim }] }
            ]}
          >
            <View style={[styles.successIcon, { backgroundColor: '#10B981' }]}>
              <CheckCircle size={48} color={colors.white} />
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>Compra Realizada!</Text>
            <Text style={[styles.successText, { color: colors.textSecondary }]}>
              Os seus bilhetes estão disponíveis na secção Os Meus Bilhetes. Receberá um email de confirmação em breve.
            </Text>
            <TouchableOpacity 
              style={[styles.successButton, { backgroundColor: colors.primary }]}
              onPress={handleSuccessClose}
            >
              <Ticket size={20} color={colors.white} />
              <Text style={[styles.successButtonText, { color: colors.white }]}>Ver Bilhetes</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBack: {
    padding: 8,
    marginLeft: -8,
  },
  stepIndicator: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  stepLabel: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 2,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: 120,
  },
  stepContent: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: SPACING.lg,
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyCartIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emptyCartTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: SPACING.sm,
  },
  emptyCartText: {
    fontSize: 14,
    textAlign: 'center' as const,
    marginBottom: SPACING.xl,
  },
  browseButton: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
  },
  browseButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  ticketCard: {
    flexDirection: 'row',
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  ticketImage: {
    width: 90,
    height: 130,
  },
  ticketContent: {
    flex: 1,
    padding: SPACING.md,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  ticketTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    flex: 1,
    marginRight: SPACING.sm,
  },
  ticketMeta: {
    marginBottom: SPACING.sm,
  },
  ticketMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ticketMetaText: {
    fontSize: 11,
  },
  ticketTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    gap: 4,
    marginBottom: SPACING.sm,
  },
  ticketTypeText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '600' as const,
    minWidth: 24,
    textAlign: 'center' as const,
  },
  ticketPrice: {
    fontSize: 17,
    fontWeight: '700' as const,
  },
  priceBreakdown: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  priceLabel: {
    fontSize: 14,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  feeNote: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: SPACING.sm,
    marginTop: -2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  paymentIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  paymentSubtitle: {
    fontSize: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  paymentForm: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: SPACING.md,
  },
  input: {
    borderRadius: RADIUS.full,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  inputHalf: {
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(0, 153, 168, 0.05)',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xl,
  },
  securityText: {
    fontSize: 12,
  },
  summaryCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: SPACING.md,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  summaryItemLeft: {
    flex: 1,
    marginRight: SPACING.md,
  },
  summaryItemTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  summaryItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  summaryItemPrice: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  summaryDivider: {
    height: 1,
    marginVertical: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  summaryTotalValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  paymentSummary: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  paymentSummaryTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: SPACING.sm,
  },
  paymentSummaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  paymentSummaryText: {
    fontSize: 14,
  },
  termsText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center' as const,
  },
  footer: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: Platform.OS === 'ios' ? 28 : SPACING.md,
    borderTopWidth: 1,
    gap: SPACING.md,
  },
  footerPrice: {
    justifyContent: 'center',
    minWidth: 90,
  },
  footerLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  footerTotal: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    gap: 4,
    ...SHADOWS.md,
  },
  footerButtonDisabled: {
    opacity: 0.6,
  },
  footerButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  successModal: {
    borderRadius: RADIUS.xxl,
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    marginBottom: SPACING.sm,
  },
  successText: {
    fontSize: 14,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: SPACING.xxl,
  },
  successButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
    width: '100%',
  },
  successButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  multibancoModal: {
    borderRadius: RADIUS.xxl,
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 380,
  },
  modalClose: {
    position: 'absolute' as const,
    top: SPACING.lg,
    right: SPACING.lg,
    zIndex: 1,
  },
  multibancoIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center' as const,
    marginBottom: SPACING.xl,
  },
  multibancoTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: SPACING.sm,
  },
  multibancoSubtitle: {
    fontSize: 14,
    textAlign: 'center' as const,
    marginBottom: SPACING.xl,
  },
  referenceBox: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
  },
  referenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  referenceLabel: {
    fontSize: 14,
  },
  referenceValue: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  multibancoInfo: {
    fontSize: 12,
    textAlign: 'center' as const,
    lineHeight: 18,
    marginBottom: SPACING.xl,
  },
  multibancoButton: {
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  multibancoButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
