import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import PromoterDashboard from "@/components/PromoterDashboard";
import AdBanner from "@/components/AdBanner";
import { useUser } from "@/hooks/user-context";
import { useTheme } from "@/hooks/theme-context";
import { useI18n } from "@/hooks/i18n-context";
import { router } from 'expo-router';
import { Event, Advertisement } from '@/types/event';
import { api } from '@/lib/api';
import { FreeBadge, isFreeEvent } from '@/components/FreeBadge';
import { EventImage } from '@/components/EventImage';
import { handleError, isRetryableError } from '@/lib/error-handler';
import { ErrorState, EventListSkeleton } from '@/components/LoadingStates';
import { RefreshControl } from 'react-native';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  UserCheck,
  AlertCircle,
  MapPin,
  Flame,
  ChevronRight,
  Star,
  Ticket,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AdminStats {
  totalUsers: number;
  totalPromoters: number;
  totalEvents: number;
  totalRevenue: number;
  pendingApprovals: number;
  activeEvents: number;
  newUsersToday: number;
  newEventsToday: number;
}

function NormalUserExploreContent() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [refreshing, setRefreshing] = React.useState(false);

  const { 
    data: featuredEventsData, 
    isLoading: isLoadingFeatured,
    error: featuredError,
    refetch: refetchFeatured 
  } = api.events.list.useQuery({ featured: true, status: 'published' });

  const { 
    data: allEventsData, 
    isLoading: isLoadingEvents,
    error: eventsError,
    refetch: refetchEvents 
  } = api.events.list.useQuery({ status: 'published' });

  const { data: adsData, error: adsError } = api.advertisements.list.useQuery({ active: true });

  React.useEffect(() => {
    console.log('[NormalUserExplore] adsData:', JSON.stringify(adsData));
    if (adsError) {
      console.error('[NormalUserExplore] adsError:', adsError);
    }
  }, [adsData, adsError]);

  const activeAds: Advertisement[] = React.useMemo(() => {
    const adsList = (adsData as any)?.ads || (Array.isArray(adsData) ? adsData : []);
    console.log('[NormalUserExplore] parsed adsList length:', adsList?.length);
    if (!adsList || !Array.isArray(adsList) || adsList.length === 0) return [];
    const now = new Date();
    return adsList
      .filter((ad: any) => {
        const startDate = new Date(ad.start_date || ad.startDate || 0);
        const endDate = new Date(ad.end_date || ad.endDate || Date.now() + 365 * 86400000);
        const inDateRange = startDate <= now && endDate >= now;
        console.log('[NormalUserExplore] ad filter:', { id: ad.id, title: ad.title, is_active: ad.is_active, startDate: startDate.toISOString(), endDate: endDate.toISOString(), inDateRange });
        return inDateRange;
      })
      .map((ad: any) => ({
        id: ad.id,
        title: ad.title || '',
        description: ad.description || '',
        image: ad.image || ad.image_url || '',
        targetUrl: ad.target_url || ad.targetUrl,
        type: ad.type || 'card',
        position: ad.position || 'home_middle',
        isActive: true,
        startDate: new Date(ad.start_date || ad.startDate || Date.now()),
        endDate: new Date(ad.end_date || ad.endDate || Date.now()),
        impressions: ad.impressions || 0,
        clicks: ad.clicks || 0,
        budget: ad.budget || 0,
      })) as Advertisement[];
  }, [adsData]);

  const featuredEvents: Event[] = React.useMemo(() => {
    if (!featuredEventsData) return [];
    return featuredEventsData.map((e: any) => ({
      ...e,
      date: new Date(e.date),
      endDate: e.endDate ? new Date(e.endDate) : undefined,
    })) as Event[];
  }, [featuredEventsData]);

  // Um evento conta como ativo no feed enquanto não termina: ainda não
  // começou, está a decorrer hoje, ou tem endDate futura (eventos multi-dia).
  const isEventLiveOrUpcoming = React.useCallback((e: Event) => {
    const now = new Date();
    if (e.date > now) return true;
    if (e.endDate) return e.endDate > now;
    return e.date.toDateString() === now.toDateString();
  }, []);

  const toEvent = React.useCallback((e: any): Event => ({
    ...e,
    date: new Date(e.date),
    endDate: e.endDate ? new Date(e.endDate) : undefined,
  }), []);

  const upcomingEvents: Event[] = React.useMemo(() => {
    if (!allEventsData) return [];
    return allEventsData
      .map(toEvent)
      .filter(isEventLiveOrUpcoming)
      .sort((a: Event, b: Event) => a.date.getTime() - b.date.getTime())
      .slice(0, 10);
  }, [allEventsData, isEventLiveOrUpcoming, toEvent]);

  const isLoading = isLoadingFeatured || isLoadingEvents;
  const error = featuredError || eventsError;

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchFeatured(), refetchEvents()]);
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setRefreshing(false);
    }
  }, [refetchFeatured, refetchEvents]);

  const getMinPrice = (event: Event) => {
    if (!event.ticketTypes || event.ticketTypes.length === 0) return null;
    return Math.min(...event.ticketTypes.map(t => t.price));
  };

  const HeroEventCard = ({ event }: { event: Event }) => (
    <TouchableOpacity
      style={styles.heroCard}
      onPress={() => router.push(`/event/${event.id}` as any)}
      activeOpacity={0.9}
    >
      <EventImage uri={event.image} style={styles.heroCardImage} />
      {isFreeEvent(event) && (
        <View style={styles.heroFreeBadge} pointerEvents="none">
          <FreeBadge size="md" />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.heroCardGradient}
      />
      <View style={styles.heroCardContent}>
        {event.isFeatured && (
          <View style={[styles.featuredTag, { backgroundColor: colors.primary }]}>
            <Star size={12} color="#fff" />
            <Text style={styles.featuredTagText}>Destaque</Text>
          </View>
        )}
        <Text style={styles.heroCardTitle} numberOfLines={2}>{event.title}</Text>
        <View style={styles.heroCardMeta}>
          <View style={styles.heroCardMetaItem}>
            <Calendar size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroCardMetaText}>
              {new Date(event.date).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <View style={styles.heroCardMetaItem}>
            <MapPin size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroCardMetaText} numberOfLines={1}>
              {event.venue?.name || ''}
            </Text>
          </View>
        </View>
        {getMinPrice(event) !== null && (
          <View style={[styles.heroCardPrice, { backgroundColor: colors.primary }]}>
            <Text style={styles.heroCardPriceText}>
              {`Desde \u20ac${getMinPrice(event)}`}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const EventListCard = ({ event }: { event: Event }) => {
    const minPrice = getMinPrice(event);
    return (
      <TouchableOpacity
        style={[styles.eventListItem, { backgroundColor: colors.card }]}
        onPress={() => router.push(`/event/${event.id}` as any)}
        activeOpacity={0.8}
      >
        <View style={styles.eventListImageWrap}>
          <EventImage uri={event.image} style={styles.eventListImage} />
          {isFreeEvent(event) && (
            <View style={styles.eventListFreeBadge} pointerEvents="none">
              <FreeBadge size="sm" />
            </View>
          )}
        </View>
        <View style={styles.eventListContent}>
          <Text style={[styles.eventListTitle, { color: colors.text }]} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.eventListInfo}>
            <Calendar size={13} color={colors.primary} />
            <Text style={[styles.eventListText, { color: colors.textSecondary }]}>
              {new Date(event.date).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <View style={styles.eventListInfo}>
            <MapPin size={13} color={colors.primary} />
            <Text style={[styles.eventListText, { color: colors.textSecondary }]} numberOfLines={1}>
              {event.venue?.name || ''}
            </Text>
          </View>
          {minPrice !== null && (
            <View style={styles.eventListPriceRow}>
              {minPrice === 0 ? (
                <FreeBadge size="sm" />
              ) : (
                <>
                  <Ticket size={13} color={colors.primary} />
                  <Text style={[styles.eventListPriceText, { color: colors.primary }]}>
                    {`Desde \u20ac${minPrice}`}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
        <ChevronRight size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  if (isLoading && !refreshing) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.exploreContent}>
            <View style={styles.exploreHeader}>
              <Text style={[styles.exploreTitle, { color: colors.text }]}>{t('events.title')}</Text>
              <Text style={[styles.exploreSubtitle, { color: colors.textSecondary }]}>{t('search.popularEvents')}</Text>
            </View>
            <EventListSkeleton count={5} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ErrorState
          message={handleError(error)}
          onRetry={isRetryableError(error) ? () => {
            void refetchFeatured();
            void refetchEvents();
          } : undefined}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.exploreContent}>
          <View style={styles.exploreHeader}>
            <View style={styles.exploreHeaderRow}>
              <View>
                <Text style={[styles.exploreTitle, { color: colors.text }]}>{t('events.title')}</Text>
                <Text style={[styles.exploreSubtitle, { color: colors.textSecondary }]}>{t('search.popularEvents')}</Text>
              </View>
              <TouchableOpacity
                style={[styles.searchButton, { backgroundColor: colors.card }]}
                onPress={() => router.push('/(tabs)/search' as any)}
              >
                <Flame size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {activeAds.length > 0 && (
            <View style={styles.adSection}>
              <AdBanner advertisement={activeAds[0]} />
            </View>
          )}

          {featuredEvents.length > 0 && (
            <View style={styles.exploreSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.exploreSectionTitle, { color: colors.text }]}>{t('events.featured')}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroScroll}>
                {featuredEvents.map((event: Event) => (
                  <HeroEventCard key={`featured-${event.id}`} event={event} />
                ))}
              </ScrollView>
            </View>
          )}

          {activeAds.length > 1 && (
            <View style={styles.adSection}>
              <AdBanner advertisement={activeAds[1]} />
            </View>
          )}

          <View style={styles.exploreSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.exploreSectionTitle, { color: colors.text }]}>{t('events.upcoming')}</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/search' as any)}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>Ver todos</Text>
              </TouchableOpacity>
            </View>
            {upcomingEvents.length > 0 ? (
              upcomingEvents.map((event: Event) => (
                <EventListCard key={`upcoming-${event.id}`} event={event} />
              ))
            ) : (
              <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
                <Calendar size={40} color={colors.textSecondary} />
                <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
                  Nenhum evento próximo
                </Text>
                <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                  Novos eventos serão adicionados em breve
                </Text>
              </View>
            )}
          </View>

          <View style={{ height: 20 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function IndexContent() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { colors } = useTheme();
  const { t } = useI18n();

  const isAdmin = user?.email === 'geral@lyven.pt';

  const { data: dashboardData } = api.analytics.dashboard.useQuery(undefined, { enabled: isAdmin });
  const { data: pendingPromotersData } = api.promoters.listPending.useQuery(undefined, { enabled: isAdmin });
  const { data: pendingEventsData } = api.events.listPending.useQuery(undefined, { enabled: isAdmin });

  const stats: AdminStats = React.useMemo(() => {
    const totalPending = (pendingPromotersData?.total ?? 0) + ((pendingEventsData as any[])?.length ?? 0);
    return {
      totalUsers: dashboardData?.totalUsers ?? 0,
      totalPromoters: 0,
      totalEvents: dashboardData?.totalEvents ?? 0,
      totalRevenue: dashboardData?.totalRevenue ?? 0,
      pendingApprovals: totalPending,
      activeEvents: dashboardData?.totalEvents ?? 0,
      newUsersToday: 0,
      newEventsToday: 0,
    };
  }, [dashboardData, pendingPromotersData, pendingEventsData]);

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color = colors.primary,
    onPress 
  }: {
    title: string;
    value: string | number;
    icon: any;
    color?: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity 
      style={[styles.statCard, { borderLeftColor: color, backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.statCardContent}>
        <View style={styles.statCardLeft}>
          <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
          <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
        </View>
        <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
          <Icon size={24} color={color} />
        </View>
      </View>
    </TouchableOpacity>
  );

  if (user?.userType === 'admin') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={[styles.welcomeText, { color: colors.text }]}>{t('common.welcome')}, {t('auth.admin')}</Text>
              <Text style={[styles.subtitleText, { color: colors.textSecondary }]}>{t('admin.adminDashboard')}</Text>
            </View>

            {stats.pendingApprovals > 0 && (
              <TouchableOpacity 
                style={[styles.alertCard, { backgroundColor: colors.warning + '10', borderColor: colors.warning + '30' }]}
                onPress={() => router.push('/admin-approvals')}
              >
                <AlertCircle size={24} color={colors.warning} />
                <View style={styles.alertContent}>
                  <Text style={[styles.alertTitle, { color: colors.warning }]}>{t('admin.pendingApprovals')}</Text>
                  <Text style={[styles.alertText, { color: colors.textSecondary }]}>
                    {stats.pendingApprovals} {stats.pendingApprovals === 1 ? 'item para aprovar' : 'itens para aprovar'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('admin.systemAnalytics')}</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statsRow}>
                  <View style={styles.statsRowItem}>
                    <StatCard
                      title={t('admin.totalUsers')}
                      value={stats.totalUsers.toLocaleString()}
                      icon={Users}
                      onPress={() => router.push('/admin-users')}
                    />
                  </View>
                  <View style={styles.statsRowItem}>
                    <StatCard
                      title={t('admin.promoters')}
                      value={stats.totalPromoters}
                      icon={UserCheck}
                      color={colors.success}
                      onPress={() => router.push('/admin-promoters')}
                    />
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statsRowItem}>
                    <StatCard
                      title={t('admin.totalEvents')}
                      value={stats.totalEvents}
                      icon={Calendar}
                      color={colors.warning}
                      onPress={() => router.push('/admin-events')}
                    />
                  </View>
                  <View style={styles.statsRowItem}>
                    <StatCard
                      title={t('admin.totalRevenue')}
                      value={`€${stats.totalRevenue.toLocaleString()}`}
                      icon={DollarSign}
                      color={colors.success}
                    />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Aprovações Pendentes</Text>
              <View style={[styles.todayStats, { backgroundColor: colors.card }]}>
                <View style={styles.todayStatItem}>
                  <Text style={[styles.todayStatValue, { color: colors.primary }]}>{pendingPromotersData?.total ?? 0}</Text>
                  <Text style={[styles.todayStatLabel, { color: colors.textSecondary }]}>Promotores</Text>
                </View>
                <View style={styles.todayStatItem}>
                  <Text style={[styles.todayStatValue, { color: colors.primary }]}>{(pendingEventsData as any[])?.length ?? 0}</Text>
                  <Text style={[styles.todayStatLabel, { color: colors.textSecondary }]}>Eventos</Text>
                </View>
                <View style={styles.todayStatItem}>
                  <Text style={[styles.todayStatValue, { color: colors.primary }]}>{dashboardData?.totalTickets ?? 0}</Text>
                  <Text style={[styles.todayStatLabel, { color: colors.textSecondary }]}>Bilhetes</Text>
                </View>
              </View>
            </View>

            <View style={{ paddingBottom: 20 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (user?.userType === 'promoter') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <PromoterDashboard promoterId={user.id} />
      </View>
    );
  }

  return <NormalUserExploreContent />;
}

export default function IndexScreen() {
  return <IndexContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    marginBottom: 5,
  },
  subtitleText: {
    fontSize: 16,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    marginBottom: 15,
  },
  statsGrid: {
    gap: 15,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 15,
  },
  statsRowItem: {
    flex: 1,
  },
  statCard: {
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCardLeft: {
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    marginBottom: 5,
  },
  statTitle: {
    fontSize: 14,
  },
  statIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayStats: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  todayStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  todayStatValue: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    marginBottom: 5,
  },
  todayStatLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  alertCard: {
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
  },
  alertContent: {
    marginLeft: 15,
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    marginBottom: 2,
  },
  alertText: {
    fontSize: 14,
  },
  exploreContent: {
    paddingBottom: 20,
  },
  exploreHeader: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  exploreHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exploreTitle: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    marginBottom: 4,
  },
  exploreSubtitle: {
    fontSize: 15,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  adSection: {
    marginBottom: 20,
  },
  exploreSection: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  exploreSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  heroScroll: {
    paddingLeft: 20,
    paddingRight: 8,
  },
  heroCard: {
    width: SCREEN_WIDTH * 0.78,
    height: 220,
    marginRight: 14,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  heroCardImage: {
    width: '100%',
    height: '100%',
  },
  heroFreeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 3,
  },
  heroCardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  heroCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  featuredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginBottom: 8,
  },
  featuredTagText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold' as const,
  },
  heroCardTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroCardMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  heroCardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroCardMetaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500' as const,
  },
  heroCardPrice: {
    position: 'absolute',
    top: -180,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 0,
  },
  heroCardPriceText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold' as const,
  },
  eventListItem: {
    flexDirection: 'row',
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
    alignItems: 'center',
    paddingRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  eventListImageWrap: {
    position: 'relative',
  },
  eventListImage: {
    width: 90,
    height: 100,
    resizeMode: 'cover',
  },
  eventListFreeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  eventListContent: {
    flex: 1,
    padding: 12,
  },
  eventListTitle: {
    fontSize: 15,
    fontWeight: 'bold' as const,
    marginBottom: 6,
  },
  eventListInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  eventListText: {
    fontSize: 13,
    flex: 1,
  },
  eventListPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  eventListPriceText: {
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  emptyState: {
    marginHorizontal: 20,
    padding: 40,
    alignItems: 'center',
    borderRadius: 16,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: 'bold' as const,
    marginTop: 8,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
  },
});