import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {
  TrendingUp,
  Users,
  Plus,
  Ticket,
  Calendar,
  Eye,
  Target,
  Percent,
  Wallet,
} from 'lucide-react-native';
import { Image } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@/hooks/user-context';
import { useTheme } from '@/hooks/theme-context';
import { api } from '@/lib/api';

interface PromoterDashboardProps {
  promoterId: string;
}

const { width } = Dimensions.get('window');

const PromoterDashboard: React.FC<PromoterDashboardProps> = ({ promoterId: _promoterId }) => {
  const { user, promoterProfile } = useUser();
  const { colors, isDark } = useTheme();

  const { data: profileByUser } = api.promoters.getByUserId.useQuery(
    { userId: user?.id ?? '' },
    { enabled: !!user?.id && user?.userType === 'promoter' }
  );

  const resolvedPromoterId = promoterProfile?.id ?? profileByUser?.id ?? null;

  const {
    data: statsData,
    isLoading: statsLoading,
  } = api.promoters.stats.useQuery(
    { id: resolvedPromoterId ?? '' },
    { enabled: !!resolvedPromoterId }
  );

  const {
    data: revenueData,
    refetch: refetchRevenue,
  } = api.analytics.promoterStats.useQuery(
    { promoterId: resolvedPromoterId ?? '' },
    { enabled: !!resolvedPromoterId }
  );

  const {
    data: eventsData,
    isLoading: eventsLoading,
    refetch,
  } = api.events.list.useQuery(
    resolvedPromoterId ? { promoterId: resolvedPromoterId } : undefined,
    { enabled: !!resolvedPromoterId }
  );

  const { data: adsData } = api.advertisements.list.useQuery(
    resolvedPromoterId ? { promoterId: resolvedPromoterId } : undefined,
    { enabled: !!resolvedPromoterId }
  );

  const [refreshing, setRefreshing] = React.useState<boolean>(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchRevenue()]);
    } catch {}
    setRefreshing(false);
  }, [refetch, refetchRevenue]);

  const events = eventsData ?? [];
  const stats = statsData ?? {
    totalEvents: 0,
    totalTicketsSold: 0,
    totalRevenue: 0,
    followersCount: 0,
    upcomingEvents: 0,
  };
  const revenue = revenueData ?? {
    totalSold: 0,
    grossRevenue: 0,
    totalCommission: 0,
    netToPromoter: 0,
  };

  const ads = adsData?.ads ?? [];
  const activeAds = ads.filter((a: any) => a.is_active);
  const totalImpressions = ads.reduce((sum: number, a: any) => sum + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((sum: number, a: any) => sum + (a.clicks || 0), 0);
  const totalAdSpend = ads.reduce((sum: number, a: any) => sum + (a.budget || 0), 0);

  const now = new Date();
  const upcomingEvents = events.filter((e: any) => new Date(e.date) >= now);
  const pastEvents = events.filter((e: any) => new Date(e.date) < now);

  const isLoading = statsLoading || eventsLoading;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const formatNumber = (value: number) => {
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return new Intl.NumberFormat('pt-PT').format(value);
  };

  const surfaceBg = isDark ? colors.cardElevated : '#f8f9fa';

  const currencyIcon = (color: string): React.ReactNode => (
    <Text style={{ fontSize: 19, fontWeight: '700' as const, lineHeight: 24, color }}>{'€'}</Text>
  );

  const renderStatCard = (title: string, value: string, icon: React.ReactNode, onPress?: () => void) => (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#000' }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.statHeader}>
        <View style={styles.statIcon}>
          {icon}
        </View>
        <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </TouchableOpacity>
  );

  const nextEvent = upcomingEvents.length > 0
    ? upcomingEvents.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
    : null;

  if (isLoading && !events.length) {
    return (
      <View style={[styles.wrapper, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>A carregar dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <View style={styles.welcomeContainer}>
          <Text style={[styles.welcomeText, { color: colors.text }]}>Bem-vindo, {user?.name || 'Promotor'}</Text>
          <Text style={[styles.welcomeSubtext, { color: colors.textSecondary }]}>
            {resolvedPromoterId ? `${events.length} evento(s) criados` : 'A carregar perfil...'}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          {renderStatCard(
            'Receita Bruta',
            formatCurrency(revenue.grossRevenue),
            currencyIcon(colors.success ?? colors.primary),
            () => router.push('/analytics')
          )}
          {renderStatCard(
            'Líquido p/ Promotor',
            formatCurrency(revenue.netToPromoter),
            <Wallet size={20} color={colors.primary} />,
            () => router.push('/analytics')
          )}
          {renderStatCard(
            'Comissão Lyven',
            formatCurrency(revenue.totalCommission),
            <Percent size={20} color={colors.error ?? colors.primary} />,
            () => router.push('/analytics')
          )}
          {renderStatCard(
            'Bilhetes Vendidos',
            formatNumber(revenue.totalSold),
            <Ticket size={20} color={colors.primary} />,
            () => router.push('/analytics')
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Resumo</Text>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total de Eventos</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{stats.totalEvents}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Eventos Próximos</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{upcomingEvents.length}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Eventos Passados</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{pastEvents.length}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Bilhetes Vendidos</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>{revenue.totalSold}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Seguidores</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{formatNumber(stats.followersCount)}</Text>
            </View>
          </View>
        </View>

        {ads.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Anúncios</Text>
            <View style={[styles.adsCard, { backgroundColor: colors.card }]}>
              <View style={styles.adsStatsGrid}>
                <View style={[styles.adsStat, { backgroundColor: surfaceBg }]}>
                  <View style={styles.adsStatIconContainer}>
                    <Target size={22} color={colors.primary} />
                  </View>
                  <Text style={[styles.adsStatValue, { color: colors.text }]}>{activeAds.length}</Text>
                  <Text style={[styles.adsStatLabel, { color: colors.textSecondary }]}>Ativos</Text>
                </View>
                <View style={[styles.adsStat, { backgroundColor: surfaceBg }]}>
                  <View style={styles.adsStatIconContainer}>
                    <Eye size={22} color={colors.primary} />
                  </View>
                  <Text style={[styles.adsStatValue, { color: colors.text }]}>{formatNumber(totalImpressions)}</Text>
                  <Text style={[styles.adsStatLabel, { color: colors.textSecondary }]}>Impressões</Text>
                </View>
                <View style={[styles.adsStat, { backgroundColor: surfaceBg }]}>
                  <View style={styles.adsStatIconContainer}>
                    <TrendingUp size={22} color={colors.primary} />
                  </View>
                  <Text style={[styles.adsStatValue, { color: colors.text }]}>{formatNumber(totalClicks)}</Text>
                  <Text style={[styles.adsStatLabel, { color: colors.textSecondary }]}>Cliques</Text>
                </View>
                <View style={[styles.adsStat, { backgroundColor: surfaceBg }]}>
                  <View style={styles.adsStatIconContainer}>
                    {currencyIcon(colors.primary)}
                  </View>
                  <Text style={[styles.adsStatValue, { color: colors.text }]}>{formatCurrency(totalAdSpend)}</Text>
                  <Text style={[styles.adsStatLabel, { color: colors.textSecondary }]}>Investido</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {nextEvent && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Próximo Evento</Text>
            <TouchableOpacity
              style={[styles.nextEventCard, { backgroundColor: colors.card }]}
              onPress={() => router.push(`/promoter-event/${(nextEvent as any).id}` as any)}
              activeOpacity={0.7}
            >
              {(nextEvent as any).image ? (
                <View style={styles.nextEventImageContainer}>
                  <Image source={{ uri: (nextEvent as any).image }} style={styles.nextEventImage} />
                  <View style={styles.nextEventImageOverlay} />
                </View>
              ) : null}
              <View style={styles.nextEventContent}>
                <Text style={[styles.nextEventTitle, { color: colors.text }]} numberOfLines={1}>{(nextEvent as any).title}</Text>
                <View style={styles.nextEventRow}>
                  <Calendar size={14} color={colors.primary} />
                  <Text style={[styles.nextEventText, { color: colors.textSecondary }]}>
                    {new Date((nextEvent as any).date).toLocaleDateString('pt-PT', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    {' '}•{' '}
                    {new Date((nextEvent as any).date).toLocaleTimeString('pt-PT', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                {(nextEvent as any).venue?.name && (
                  <View style={styles.nextEventRow}>
                    <Target size={14} color={colors.textSecondary} />
                    <Text style={[styles.nextEventText, { color: colors.textSecondary }]}>{(nextEvent as any).venue.name}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}

        {events.length === 0 && !isLoading && (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Calendar size={48} color={colors.textLight} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhum evento criado</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Crie o seu primeiro evento para começar a vender bilhetes
            </Text>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/create-event')}
            >
              <Plus size={20} color="#fff" />
              <Text style={styles.createButtonText}>Criar Evento</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ paddingBottom: 100 }} />
      </ScrollView>

      <TouchableOpacity
        style={[styles.floatingButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
        onPress={() => router.push('/create-event')}
      >
        <Plus size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  floatingButton: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  welcomeContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700' as const,
  },
  welcomeSubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  statCard: {
    borderRadius: 16,
    padding: 18,
    width: (width - 44) / 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statIcon: {
    marginRight: 8,
  },
  statTitle: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  section: {
    marginHorizontal: 16,
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  summaryLabel: {
    fontSize: 15,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700' as const,
  },
  summaryDivider: {
    height: 1,
  },
  adsCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  adsStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  adsStat: {
    width: (width - 92) / 2,
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  adsStatIconContainer: {
    marginBottom: 8,
  },
  adsStatValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  adsStatLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 40,
    marginHorizontal: 16,
    borderRadius: 16,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  nextEventCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  nextEventImageContainer: {
    position: 'relative',
    width: '100%',
    height: 140,
  },
  nextEventImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  nextEventImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  nextEventContent: {
    padding: 16,
  },
  nextEventTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  nextEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  nextEventText: {
    fontSize: 14,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 9999,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});

export default PromoterDashboard;
