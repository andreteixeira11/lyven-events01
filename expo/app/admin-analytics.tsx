import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import {
  BarChart3,
  Users,
  Calendar,
  DollarSign,
  Target,
  Award,
  MapPin,
  User,
  LogOut,
  Percent,
  TrendingUp,
} from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';

export default function AdminAnalytics() {
  const { logout } = useUser();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');

  const { data: dashboardData, isLoading: dashboardLoading, refetch: refetchDashboard } = api.analytics.dashboard.useQuery({ period: selectedPeriod });
  const { data: analyticsEventsData, isLoading: eventsLoading } = api.analytics.events.useQuery();
  const { data: rawEvents = [] } = api.events.list.useQuery();
  const { data: commissionData, isLoading: commissionLoading } = api.analytics.commissions.useQuery({ period: selectedPeriod });

  const stats = useMemo(() => dashboardData || { totalUsers: 0, totalEvents: 0, totalTickets: 0, totalRevenue: 0, totalCommission: 0, netToPromoters: 0, periodTickets: 0, periodRevenue: 0, pendingEvents: 0, pendingPromoters: 0, activeAds: 0 }, [dashboardData]);

  const commission = useMemo(() => commissionData || {
    totalCommission: 0, totalVolume: 0,
    tier1Count: 0, tier1Commission: 0,
    tier2Count: 0, tier2Commission: 0,
    tier3Count: 0, tier3Commission: 0,
    perEvent: [],
  }, [commissionData]);

  const topEvents = useMemo(() => {
    const analyticsEvents = analyticsEventsData?.events || [];
    return analyticsEvents
      .slice(0, 5)
      .map((e: any) => ({
        id: e.id,
        title: e.title || '',
        promoterName: e.promoter?.name || 'Desconhecido',
        date: e.date || '',
        location: e.venue_city || '',
        category: e.category || 'other',
        ticketsSold: e.ticketsSold || 0,
        revenue: e.revenue || 0,
      }));
  }, [analyticsEventsData]);

  const categoryStats = useMemo(() => {
    const cats: Record<string, number> = {};
    (analyticsEventsData?.events || []).forEach((e: any) => {
      const cat = e.category || 'other';
      if (!cats[cat]) cats[cat] = 0;
      cats[cat] += (e.ticketsSold || 0);
    });
    const total = Object.values(cats).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count], i) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: Math.round((count / total) * 100),
        color: [COLORS.primary, COLORS.warning, COLORS.success, COLORS.info][i] || COLORS.gray,
      }));
  }, [analyticsEventsData]);

  const handleLogout = () => {
    Alert.alert('Terminar Sessão', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const formatCurrency = (value: number) => `€${value.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const isLoading = dashboardLoading || eventsLoading;

  const StatCard = ({ title, value, icon: Icon, color = COLORS.primary }: {
    title: string; value: string | number; icon: any; color?: string;
  }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statCardHeader}>
        <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
          <Icon size={20} color={color} />
        </View>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: 'Estatísticas da Plataforma',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: 'bold' as const },
        headerRight: () => (
          <TouchableOpacity style={styles.profileButton} onPress={handleLogout}>
            <User size={20} color={COLORS.white} /><LogOut size={16} color={COLORS.white} />
          </TouchableOpacity>
        ),
      }} />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetchDashboard()} />}
      >
        <View style={styles.content}>
          <View style={styles.periodSelector}>
            {(['week', 'month', 'year'] as const).map(period => (
              <TouchableOpacity
                key={period}
                style={[styles.periodButton, selectedPeriod === period && styles.periodButtonActive]}
                onPress={() => setSelectedPeriod(period)}
              >
                <Text style={[styles.periodButtonText, selectedPeriod === period && styles.periodButtonTextActive]}>
                  {period === 'week' ? 'Semana' : period === 'month' ? 'Mês' : 'Ano'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>A carregar estatísticas...</Text>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Visão Geral da Plataforma</Text>
                <View style={styles.statsGrid}>
                  <StatCard title="Receita Bruta" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color={COLORS.success} />
                  <StatCard title="Comissão Lyven" value={formatCurrency(stats.totalCommission || 0)} icon={Percent} color={COLORS.error} />
                  <StatCard title="Líquido p/ Promotores" value={formatCurrency(stats.netToPromoters || 0)} icon={TrendingUp} color={COLORS.primary} />
                  <StatCard title="Bilhetes Vendidos" value={(stats.totalTickets || 0).toLocaleString()} icon={Target} color={COLORS.primary} />
                  <StatCard title="Total de Eventos" value={stats.totalEvents} icon={Calendar} color={COLORS.warning} />
                  <StatCard title="Total Utilizadores" value={(stats.totalUsers || 0).toLocaleString()} icon={Users} color={COLORS.info} />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>No Período Selecionado</Text>
                <View style={styles.statsGrid}>
                  <StatCard title={`Receita (${selectedPeriod === 'week' ? 'Semana' : selectedPeriod === 'month' ? 'Mês' : 'Ano'})`} value={formatCurrency(stats.periodRevenue || 0)} icon={DollarSign} color={COLORS.success} />
                  <StatCard title={`Bilhetes (${selectedPeriod === 'week' ? 'Semana' : selectedPeriod === 'month' ? 'Mês' : 'Ano'})`} value={(stats.periodTickets || 0).toLocaleString()} icon={Target} color={COLORS.primary} />
                  <StatCard title="Eventos Pendentes" value={stats.pendingEvents || 0} icon={Calendar} color={COLORS.warning} />
                  <StatCard title="Promotores Pendentes" value={stats.pendingPromoters || 0} icon={Users} color={COLORS.info} />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Métricas Chave</Text>
                <View style={styles.metricsContainer}>
                  <View style={styles.metricCard}>
                    <Award size={24} color={COLORS.primary} />
                    <Text style={styles.metricValue}>
                      {stats.totalTickets > 0 ? formatCurrency(Math.round(stats.totalRevenue / stats.totalTickets)) : '€0'}
                    </Text>
                    <Text style={styles.metricLabel}>Preço Médio do Bilhete</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <BarChart3 size={24} color={COLORS.warning} />
                    <Text style={styles.metricValue}>
                      {categoryStats.length > 0 ? categoryStats[0].name : 'N/A'}
                    </Text>
                    <Text style={styles.metricLabel}>Categoria Mais Popular</Text>
                  </View>
                </View>
              </View>

              {categoryStats.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Top Categorias (por bilhetes vendidos)</Text>
                  <View style={styles.categoryList}>
                    {categoryStats.map((category, index) => (
                      <View key={index} style={styles.categoryItem}>
                        <View style={styles.categoryInfo}>
                          <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                          <Text style={styles.categoryName}>{category.name}</Text>
                        </View>
                        <Text style={styles.categoryValue}>{category.value}%</Text>
                        <View style={styles.categoryBar}>
                          <View style={[styles.categoryBarFill, { width: `${category.value}%`, backgroundColor: category.color }]} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {topEvents.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Top Eventos (por receita)</Text>
                  <View style={styles.eventsContainer}>
                    {topEvents.map((event: any, index: number) => (
                      <View key={event.id} style={styles.eventCard}>
                        <View style={styles.eventRank}>
                          <Award size={20} color={index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32'} />
                          <Text style={styles.rankText}>#{index + 1}</Text>
                        </View>
                        <View style={styles.eventContent}>
                          <Text style={styles.eventTitle}>{event.title}</Text>
                          <Text style={styles.eventPromoter}>por {event.promoterName}</Text>
                          <View style={styles.eventMeta}>
                            {event.location ? (
                              <View style={styles.metaItem}>
                                <MapPin size={12} color={COLORS.textSecondary} />
                                <Text style={styles.metaText}>{event.location}</Text>
                              </View>
                            ) : null}
                            <View style={styles.metaItem}>
                              <Target size={12} color={COLORS.textSecondary} />
                              <Text style={styles.metaText}>{event.ticketsSold} bilhetes</Text>
                            </View>
                            <View style={styles.metaItem}>
                              <DollarSign size={12} color={COLORS.textSecondary} />
                              <Text style={styles.metaText}>{formatCurrency(event.revenue)}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Commission Breakdown */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Comissões da Plataforma</Text>

                {commissionLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : (
                  <>
                    {/* Summary cards */}
                    <View style={styles.commissionSummaryRow}>
                      <View style={[styles.commissionSummaryCard, { borderLeftColor: COLORS.success }]}>
                        <View style={[styles.statIconContainer, { backgroundColor: COLORS.success + '20' }]}>
                          <DollarSign size={20} color={COLORS.success} />
                        </View>
                        <Text style={styles.commissionSummaryValue}>{formatCurrency(commission.totalCommission)}</Text>
                        <Text style={styles.commissionSummaryLabel}>Comissão Total</Text>
                      </View>
                      <View style={[styles.commissionSummaryCard, { borderLeftColor: COLORS.primary }]}>
                        <View style={[styles.statIconContainer, { backgroundColor: COLORS.primary + '20' }]}>
                          <TrendingUp size={20} color={COLORS.primary} />
                        </View>
                        <Text style={styles.commissionSummaryValue}>{formatCurrency(commission.totalVolume)}</Text>
                        <Text style={styles.commissionSummaryLabel}>Volume Total</Text>
                      </View>
                    </View>

                    {/* Tier breakdown */}
                    <View style={styles.commissionTiersCard}>
                      <Text style={styles.commissionTierHeader}>Escalões de Comissão</Text>

                      {/* Tier 1 */}
                      <View style={styles.commissionTierRow}>
                        <View style={[styles.commissionTierBadge, { backgroundColor: COLORS.success + '15' }]}>
                          <Percent size={14} color={COLORS.success} />
                        </View>
                        <View style={styles.commissionTierInfo}>
                          <Text style={styles.commissionTierTitle}>Até €20.00</Text>
                          <Text style={styles.commissionTierRate}>5.0% + €0.50</Text>
                        </View>
                        <View style={styles.commissionTierStats}>
                          <Text style={styles.commissionTierCount}>{commission.tier1Count} bilhetes</Text>
                          <Text style={[styles.commissionTierAmount, { color: COLORS.success }]}>
                            {formatCurrency(commission.tier1Commission)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.commissionDivider} />

                      {/* Tier 2 */}
                      <View style={styles.commissionTierRow}>
                        <View style={[styles.commissionTierBadge, { backgroundColor: COLORS.warning + '15' }]}>
                          <Percent size={14} color={COLORS.warning} />
                        </View>
                        <View style={styles.commissionTierInfo}>
                          <Text style={styles.commissionTierTitle}>€20.01 a €50.00</Text>
                          <Text style={styles.commissionTierRate}>4.5% + €0.60</Text>
                        </View>
                        <View style={styles.commissionTierStats}>
                          <Text style={styles.commissionTierCount}>{commission.tier2Count} bilhetes</Text>
                          <Text style={[styles.commissionTierAmount, { color: COLORS.warning }]}>
                            {formatCurrency(commission.tier2Commission)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.commissionDivider} />

                      {/* Tier 3 */}
                      <View style={styles.commissionTierRow}>
                        <View style={[styles.commissionTierBadge, { backgroundColor: COLORS.info + '15' }]}>
                          <Percent size={14} color={COLORS.info} />
                        </View>
                        <View style={styles.commissionTierInfo}>
                          <Text style={styles.commissionTierTitle}>Acima de €50.00</Text>
                          <Text style={styles.commissionTierRate}>3.5% + €1.00</Text>
                        </View>
                        <View style={styles.commissionTierStats}>
                          <Text style={styles.commissionTierCount}>{commission.tier3Count} bilhetes</Text>
                          <Text style={[styles.commissionTierAmount, { color: COLORS.info }]}>
                            {formatCurrency(commission.tier3Commission)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Per-event commission */}
                    {commission.perEvent && commission.perEvent.length > 0 && (
                      <View style={styles.commissionTiersCard}>
                        <Text style={styles.commissionTierHeader}>Comissão por Evento</Text>
                        {commission.perEvent.slice(0, 8).map((e: any, i: number) => (
                          <View key={e.eventId}>
                            {i > 0 && <View style={styles.commissionDivider} />}
                            <View style={styles.commissionEventRow}>
                              <View style={styles.commissionEventInfo}>
                                <Text style={styles.commissionEventTitle} numberOfLines={1}>{e.title}</Text>
                                <Text style={styles.commissionEventMeta}>{e.ticketCount} bilhetes · {formatCurrency(e.volume)}</Text>
                              </View>
                              <Text style={styles.commissionEventAmount}>
                                {formatCurrency(e.commission)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            </>
          )}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  content: { padding: 20 },
  periodSelector: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 9999, padding: 4, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  periodButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9999 },
  periodButtonActive: { backgroundColor: COLORS.primary },
  periodButtonText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' as const },
  periodButtonTextActive: { color: COLORS.white, fontWeight: 'bold' as const },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 15 },
  statsGrid: { gap: 15 },
  statCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 20, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  statCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statIconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 5 },
  statTitle: { fontSize: 14, color: COLORS.textSecondary },
  metricsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  metricCard: {
    flex: 1, minWidth: 150, backgroundColor: COLORS.white, borderRadius: 12, padding: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  metricValue: { fontSize: 18, fontWeight: 'bold' as const, color: COLORS.text, marginTop: 10, marginBottom: 5 },
  metricLabel: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center' as const },
  categoryList: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 15, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  categoryItem: { gap: 8 },
  categoryInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  categoryName: { flex: 1, fontSize: 14, fontWeight: '600' as const, color: COLORS.text },
  categoryValue: { fontSize: 16, fontWeight: 'bold' as const, color: COLORS.primary },
  categoryBar: { height: 6, backgroundColor: COLORS.lightGray, borderRadius: 3, overflow: 'hidden' },
  categoryBarFill: { height: '100%', borderRadius: 3 },
  eventsContainer: { gap: 12 },
  eventCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  eventRank: { alignItems: 'center', gap: 4 },
  rankText: { fontSize: 12, fontWeight: 'bold' as const, color: COLORS.textSecondary },
  eventContent: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 4 },
  eventPromoter: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  eventMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.textSecondary },
  loadingContainer: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  commissionSummaryRow: { flexDirection: 'row', gap: 15, marginBottom: 15 },
  commissionSummaryCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 12, padding: 20, borderLeftWidth: 4, alignItems: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  commissionSummaryValue: { fontSize: 22, fontWeight: 'bold' as const, color: COLORS.text, marginTop: 10, marginBottom: 4 },
  commissionSummaryLabel: { fontSize: 13, color: COLORS.textSecondary },
  commissionTiersCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  commissionTierHeader: { fontSize: 16, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 16 },
  commissionTierRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  commissionTierBadge: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  commissionTierInfo: { flex: 1 },
  commissionTierTitle: { fontSize: 15, fontWeight: '600' as const, color: COLORS.text, marginBottom: 2 },
  commissionTierRate: { fontSize: 13, color: COLORS.textSecondary },
  commissionTierStats: { alignItems: 'flex-end' },
  commissionTierCount: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  commissionTierAmount: { fontSize: 16, fontWeight: 'bold' as const },
  commissionDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },
  commissionEventRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commissionEventInfo: { flex: 1, marginRight: 12 },
  commissionEventTitle: { fontSize: 14, fontWeight: '600' as const, color: COLORS.text, marginBottom: 3 },
  commissionEventMeta: { fontSize: 12, color: COLORS.textSecondary },
  commissionEventAmount: { fontSize: 15, fontWeight: 'bold' as const, color: COLORS.success },
  profileButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 15, gap: 6,
  },
});
