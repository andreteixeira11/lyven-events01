import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  Mail,
  Phone,
  CheckCircle2,
  Clock,
  QrCode,
  Ticket,
  CalendarDays,
  UserCheck,
  ShoppingBag,
} from 'lucide-react-native';
import { api } from '@/lib/api';
import { LoadingSpinner, ErrorState } from '@/components/LoadingStates';
import BackButton from '@/components/BackButton';
import { useTheme } from '@/hooks/theme-context';
import { useManualValidation } from '@/hooks/use-manual-validation';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value || 0);

const formatDateTime = (value?: string | Date | null) => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

export default function BuyerDetailsScreen() {
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId?: string }>();
  const { colors, isDark } = useTheme();

  const { data: stats, isLoading, refetch, isRefetching } = api.analytics.eventStats.useQuery(
    { eventId: eventId ?? '' },
    { enabled: !!eventId },
  );
  const { data: event } = api.events.get.useQuery({ id: eventId ?? '' }, { enabled: !!eventId });
  const { confirmValidation, validatingId } = useManualValidation(eventId);

  const buyer = useMemo(() => (stats?.buyers ?? []).find((b: any) => b.id === id) as any | undefined, [stats, id]);

  const { data: history } = api.analytics.buyerHistory.useQuery(
    { userId: buyer?.userId ?? '' },
    { enabled: !!buyer?.userId },
  );
  const otherPurchases = useMemo(() => (history ?? []).filter((h) => h.ticketId !== id), [history, id]);

  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const header = (
    <Stack.Screen
      options={{
        title: 'Comprador',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerLeft: () => <BackButton onPress={() => router.back()} color={colors.text} />,
      }}
    />
  );

  if (!eventId) {
    return (
      <View style={s.container}>
        {header}
        <ErrorState message="Abra o comprador a partir da lista do evento." />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={s.container}>
        {header}
        <LoadingSpinner message="A carregar comprador..." />
      </View>
    );
  }

  if (!buyer) {
    return (
      <View style={s.container}>
        {header}
        <ErrorState message="Comprador não encontrado ou sem permissão para ver este evento." onRetry={() => refetch()} />
      </View>
    );
  }

  const hasEmail = !!buyer.email;
  const hasPhone = !!buyer.phone;

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir a aplicação.');
    }
  };

  return (
    <View style={s.container}>
      {header}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={colors.primary} />}
      >
        <View style={s.profile}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials(buyer.name)}</Text>
          </View>
          <Text style={s.name}>{buyer.name}</Text>
          {event?.title ? <Text style={s.eventName}>{event.title}</Text> : null}
          <View style={[s.statusPill, buyer.isValidated ? s.pillOk : s.pillPending]}>
            {buyer.isValidated ? (
              <CheckCircle2 size={14} color={colors.success} />
            ) : (
              <Clock size={14} color={colors.warning} />
            )}
            <Text style={[s.statusText, { color: buyer.isValidated ? colors.success : colors.warning }]}>
              {buyer.isValidated ? `Entrou às ${formatDateTime(buyer.validatedAt)}` : 'Ainda não entrou'}
            </Text>
          </View>
        </View>

        {!buyer.isValidated ? (
          <View style={s.actionsBlock}>
            <TouchableOpacity
              testID="manual-validate"
              style={s.primaryButton}
              disabled={validatingId === buyer.id}
              onPress={() => confirmValidation(buyer)}
              activeOpacity={0.85}
            >
              {validatingId === buyer.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <UserCheck size={20} color="#fff" />
                  <Text style={s.primaryButtonText}>Validar entrada</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.secondaryButton}
              onPress={() => router.push(`/qr-scanner/${eventId}`)}
              activeOpacity={0.85}
            >
              <QrCode size={18} color={colors.primary} />
              <Text style={s.secondaryButtonText}>Ler QR code</Text>
            </TouchableOpacity>
            <Text style={s.hint}>
              Use “Validar entrada” se o comprador não conseguir mostrar o QR code. Cada bilhete só pode ser validado uma vez.
            </Text>
          </View>
        ) : null}

        <Text style={s.sectionTitle}>Contacto</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            disabled={!hasEmail}
            onPress={() => openUrl(`mailto:${buyer.email}`)}
          >
            <Mail size={18} color={colors.textSecondary} />
            <Text style={[s.rowText, !hasEmail && s.muted]} selectable>{hasEmail ? buyer.email : 'Sem email'}</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.row}
            disabled={!hasPhone}
            onPress={() => openUrl(`tel:${String(buyer.phone).replace(/\s+/g, '')}`)}
          >
            <Phone size={18} color={colors.textSecondary} />
            <Text style={[s.rowText, !hasPhone && s.muted]} selectable>{hasPhone ? buyer.phone : 'Sem telefone'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionTitle}>Bilhete</Text>
        <View style={s.card}>
          <InfoRow s={s} icon={<Ticket size={18} color={colors.textSecondary} />} label="Tipo" value={buyer.ticketType} />
          <View style={s.divider} />
          <InfoRow s={s} label="Quantidade" value={String(buyer.quantity)} />
          <View style={s.divider} />
          <InfoRow s={s} label="Preço unitário" value={formatCurrency(buyer.unitPrice)} />
          <View style={s.divider} />
          <InfoRow s={s} label="Total pago" value={formatCurrency(buyer.totalPaid)} strong />
          <View style={s.divider} />
          <InfoRow s={s} icon={<CalendarDays size={18} color={colors.textSecondary} />} label="Comprado em" value={formatDateTime(buyer.purchaseDate)} />
          {buyer.qrCode ? (
            <>
              <View style={s.divider} />
              <View style={s.rowColumn}>
                <Text style={s.label}>Código</Text>
                <Text style={s.code} selectable numberOfLines={2}>{buyer.qrCode}</Text>
              </View>
            </>
          ) : null}
        </View>

        <Text style={s.sectionTitle}>Compras nos seus eventos</Text>
        <View style={s.card}>
          {otherPurchases.length === 0 ? (
            <View style={s.row}>
              <ShoppingBag size={18} color={colors.textSecondary} />
              <Text style={[s.rowText, s.muted]}>Primeira compra num evento seu</Text>
            </View>
          ) : (
            otherPurchases.map((h, idx) => (
              <View key={h.ticketId}>
                {idx > 0 ? <View style={s.divider} /> : null}
                <View style={s.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowText} numberOfLines={1}>{(h.eventTitle || 'Evento').trim()}</Text>
                    <Text style={s.label}>{h.quantity}× · {formatDateTime(h.purchaseDate)}</Text>
                  </View>
                  <Text style={[s.historyStatus, { color: h.isUsed ? colors.success : colors.textSecondary }]}>
                    {h.isUsed ? 'Entrou' : 'Por usar'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ s, icon, label, value, strong }: {
  s: ReturnType<typeof makeStyles>; icon?: React.ReactNode; label: string; value: string; strong?: boolean;
}) {
  return (
    <View style={s.row}>
      {icon ?? <View style={{ width: 18 }} />}
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, strong && s.valueStrong]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 48 },
    profile: { alignItems: 'center', marginBottom: 20 },
    avatar: {
      width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primaryLight,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    avatarText: { fontSize: 28, fontWeight: '700', color: colors.primary },
    name: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
    eventName: { fontSize: 14, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
    statusPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    },
    pillOk: { backgroundColor: isDark ? 'rgba(52,211,153,0.15)' : 'rgba(16,185,129,0.12)' },
    pillPending: { backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : 'rgba(245,158,11,0.12)' },
    statusText: { fontSize: 13, fontWeight: '600' },
    actionsBlock: { gap: 10, marginBottom: 12 },
    primaryButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: colors.success, paddingVertical: 15, borderRadius: 14,
    },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondaryButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: colors.primaryLight, paddingVertical: 13, borderRadius: 14,
    },
    secondaryButtonText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 17 },
    sectionTitle: {
      fontSize: 13, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase',
      letterSpacing: 0.6, marginTop: 20, marginBottom: 8, marginLeft: 4,
    },
    card: {
      backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border, overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    rowColumn: { paddingHorizontal: 16, paddingVertical: 14, gap: 4 },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    historyStatus: { fontSize: 13, fontWeight: '600' },
    rowText: { flex: 1, fontSize: 15, color: colors.text },
    muted: { color: colors.textLight },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 },
    label: { fontSize: 13, color: colors.textSecondary, flexShrink: 0 },
    value: { flex: 1, textAlign: 'right', fontSize: 15, color: colors.text },
    valueStrong: { fontWeight: '700' },
    code: { fontSize: 12, color: colors.text, fontFamily: 'Courier' },
  });
}
