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
  Euro,
  Plus,
  Ticket,
  Calendar,
  Eye,
  Target,
} from 'lucide-react-native';
import { Image } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';

interface PromoterDashboardProps {
  promoterId: string;
}

const { width } = Dimensions.get('window');

const PromoterDashboard: React.FC<PromoterDashboardProps> = ({ promoterId: _promoterId }) => {
  const { user, promoterProfile } = useUser();

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

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch {}
    setRefreshing(false);
  }, [refetch]);

  const events = eventsData ?? [];
  const stats = statsData ?? {
    totalEvents: 0,
    totalTicketsSold: 0,
    totalRevenue: 0,
    followersCount: 0,
    upcomingEvents: 0,
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

  const renderStatCard = (title: string, value: string, icon: React.ReactNode, onPress?: () => void) => (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.statHeader}>
        <View style={styles.statIcon}>
          {icon}
        </View>
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </TouchableOpacity>
  );

  const nextEvent = upcomingEvents.length > 0
    ? upcomingEvents.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
    : null;

  if (isLoading && !events.length) {
    return (
      <View style={[styles.wrapper, styles.centered]}>
        <ActivityIndicator size="large" color="#0099a8" />
        <Text style={styles.loadingText}>A carregar dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0099a8" colors={['#0099a8']} />
        }
      >
        <View style={styles.welcomeContainer}>
          <Text style={styles.welcomeText}>Bem-vindo, {user?.name || 'Promotor'}</Text>
          <Text style={styles.welcomeSubtext}>
            {resolvedPromoterId ? `${events.length} evento(s) criados` : 'A carregar perfil...'}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          {renderStatCard(
            'Receita Total',
            formatCurrency(stats.totalRevenue),
            <Euro size={20} color="#0099a8" />
          )}
          {renderStatCard(
            'Bilhetes Vendidos',
            formatNumber(stats.totalTicketsSold),
            <Ticket size={20} color="#0099a8" />
          )}
          {renderStatCard(
            'Seguidores',
            formatNumber(stats.followersCount),
            <Users size={20} color="#0099a8" />
          )}
          {renderStatCard(
            'Eventos Próximos',
            String(upcomingEvents.length),
            <Calendar size={20} color="#0099a8" />,
            () => router.push('/(tabs)/promoter-events' as any)
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total de Eventos</Text>
              <Text style={styles.summaryValue}>{stats.totalEvents}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Eventos Próximos</Text>
              <Text style={styles.summaryValue}>{upcomingEvents.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Eventos Passados</Text>
              <Text style={styles.summaryValue}>{pastEvents.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Bilhetes Vendidos</Text>
              <Text style={[styles.summaryValue, { color: '#0099a8' }]}>{stats.totalTicketsSold}</Text>
            </View>
          </View>
        </View>

        {ads.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Anúncios</Text>
            <View style={styles.adsCard}>
              <View style={styles.adsStatsGrid}>
                <View style={styles.adsStat}>
                  <View style={styles.adsStatIconContainer}>
                    <Target size={22} color="#0099a8" />
                  </View>
                  <Text style={styles.adsStatValue}>{activeAds.length}</Text>
                  <Text style={styles.adsStatLabel}>Ativos</Text>
                </View>
                <View style={styles.adsStat}>
                  <View style={styles.adsStatIconContainer}>
                    <Eye size={22} color="#0099a8" />
                  </View>
                  <Text style={styles.adsStatValue}>{formatNumber(totalImpressions)}</Text>
                  <Text style={styles.adsStatLabel}>Impressões</Text>
                </View>
                <View style={styles.adsStat}>
                  <View style={styles.adsStatIconContainer}>
                    <TrendingUp size={22} color="#0099a8" />
                  </View>
                  <Text style={styles.adsStatValue}>{formatNumber(totalClicks)}</Text>
                  <Text style={styles.adsStatLabel}>Cliques</Text>
                </View>
                <View style={styles.adsStat}>
                  <View style={styles.adsStatIconContainer}>
                    <Euro size={22} color="#0099a8" />
                  </View>
                  <Text style={styles.adsStatValue}>{formatCurrency(totalAdSpend)}</Text>
                  <Text style={styles.adsStatLabel}>Investido</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {nextEvent && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Próximo Evento</Text>
            <TouchableOpacity
              style={styles.nextEventCard}
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
                <Text style={styles.nextEventTitle} numberOfLines={1}>{(nextEvent as any).title}</Text>
                <View style={styles.nextEventRow}>
                  <Calendar size={14} color="#0099a8" />
                  <Text style={styles.nextEventText}>
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
                    <Target size={14} color="#888" />
                    <Text style={styles.nextEventText}>{(nextEvent as any).venue.name}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}

        {events.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Calendar size={48} color="#ccc" />
            <Text style={styles.emptyTitle}>Nenhum evento criado</Text>
            <Text style={styles.emptySubtitle}>
              Crie o seu primeiro evento para começar a vender bilhetes
            </Text>
            <TouchableOpacity
              style={styles.createButton}
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
        style={styles.floatingButton}
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
    backgroundColor: '#f8f9fa',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  floatingButton: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0099a8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0099a8',
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
    color: '#1a1a1a',
  },
  welcomeSubtext: {
    fontSize: 14,
    color: '#888',
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
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: (width - 44) / 2,
    shadowColor: '#000',
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
    color: '#666',
    fontWeight: '500' as const,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#333',
    marginBottom: 4,
  },
  section: {
    marginHorizontal: 16,
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1a1a1a',
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: '#fff',
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
    color: '#555',
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#333',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
  },
  adsCard: {
    backgroundColor: '#fff',
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
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  adsStatIconContainer: {
    marginBottom: 8,
  },
  adsStatValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#333',
    marginBottom: 4,
  },
  adsStatLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 40,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  nextEventCard: {
    backgroundColor: '#fff',
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
    color: '#1a1a1a',
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
    color: '#666',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0099a8',
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
