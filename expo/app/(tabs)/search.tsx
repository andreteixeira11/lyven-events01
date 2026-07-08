import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Animated,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { 
  Users, 
  Search as SearchIcon, 
  Filter,
  UserCheck,
  UserX,
  Crown,
  Calendar,
  Mail,
  Phone,
  MapPin,
  MoreVertical,
  Edit3,
  Trash2,
  Eye,
  Clock,
  DollarSign,
  Plus,
  Map,
  List,
  X,
  ChevronDown,
  Navigation,
  SlidersHorizontal,
  Compass,
  Star,
  Check,
} from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { useTheme } from '@/hooks/theme-context';
import { useUser } from '@/hooks/user-context';
import { Event } from '@/types/event';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/use-debounce';
import { handleError, isRetryableError } from '@/lib/error-handler';
import { LoadingSpinner, ErrorState, EventListSkeleton } from '@/components/LoadingStates';
import { RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AdBanner from '@/components/AdBanner';
import { Advertisement } from '@/types/event';
import { FreeBadge, isFreeEvent } from '@/components/FreeBadge';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  userType: 'normal' | 'promoter' | 'admin';
  location?: string;
  joinDate: string;
  lastActive: string;
  isActive: boolean;
  eventsAttended?: number;
  eventsCreated?: number;
  totalSpent?: number;
  isVerified: boolean;
}

function SearchContent() {
  const { user } = useUser();

  if (user?.userType === 'admin') {
    return <AdminUsersContent />;
  }

  if (user?.userType === 'promoter') {
    return <PromoterEventsContent />;
  }

  return <NormalUserSearchContent />;
}

type ViewMode = 'list' | 'map';
type DateFilter = 'all' | 'today' | 'week' | 'month';
type PriceFilter = 'all' | 'free' | 'under20' | 'under50' | 'over50';

const MADEIRA_MUNICIPALITIES = [
  'Todas',
  'Funchal',
  'Câmara de Lobos',
  'Machico',
  'Santa Cruz',
  'Santana',
  'São Vicente',
  'Porto Santo',
  'Ribeira Brava',
  'Calheta',
  'Ponta do Sol',
  'Porto Moniz',
];

function useUserLocation() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        if ('geolocation' in navigator) {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
            });
          });
          setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        } else {
          setError('Geolocalização não disponível');
        }
      } else {
        try {
          const Location = require('expo-location');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            setError('Permissão de localização negada');
            return;
          }
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        } catch {
          setError('Não foi possível obter localização');
        }
      }
    } catch {
      setError('Não foi possível obter localização');
    } finally {
      setLoading(false);
    }
  }, []);

  return { location, loading, error, requestLocation };
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function NormalUserSearchContent() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [cityFilters, setCityFilters] = useState<string[]>([]);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const nearbyRadius = 50;
  const filterSlideAnim = useRef(new Animated.Value(0)).current;
  const { location, loading: locationLoading, error: locationError, requestLocation } = useUserLocation();

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateFilter !== 'all') count++;
    if (priceFilter !== 'all') count++;
    if (cityFilters.length > 0) count++;
    return count;
  }, [dateFilter, priceFilter, cityFilters]);

  useEffect(() => {
    Animated.spring(filterSlideAnim, {
      toValue: showFilters ? 1 : 0,
      tension: 80,
      friction: 12,
      useNativeDriver: false,
    }).start();
  }, [showFilters, filterSlideAnim]);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { 
    data: allEventsData, 
    isLoading: isLoadingEvents,
    error: eventsError,
    refetch: refetchEvents 
  } = api.events.list.useQuery(
    { category: selectedCategory === 'all' ? undefined : selectedCategory as any },
    { enabled: debouncedSearchQuery.length === 0 }
  );

  const { 
    data: searchResults, 
    isLoading: isSearching,
    error: searchError,
    refetch: refetchSearch 
  } = api.events.search.useQuery(
    {
      query: debouncedSearchQuery,
      category: selectedCategory === 'all' ? undefined : selectedCategory as any,
      limit: 50,
    },
    { 
      enabled: debouncedSearchQuery.length > 0,
      retry: 2,
    }
  );

  const { 
    data: suggestions 
  } = api.events.searchSuggestions.useQuery(
    { query: debouncedSearchQuery },
    { 
      enabled: debouncedSearchQuery.length >= 2,
    }
  );

  const categories = [
    { id: 'all', label: 'Todos', icon: '🎉' },
    { id: 'music', label: 'Música', icon: '🎵' },
    { id: 'festival', label: 'Festivais', icon: '🎪' },
    { id: 'theater', label: 'Teatro', icon: '🎭' },
    { id: 'comedy', label: 'Comédia', icon: '😂' },
    { id: 'dance', label: 'Dança', icon: '💃' },
    { id: 'other', label: 'Outros', icon: '🎯' },
  ];

  const baseEvents: Event[] = useMemo(() => {
    if (debouncedSearchQuery.length > 0 && searchResults) {
      return searchResults.map((result: any) => ({
        ...result,
        date: new Date(result.date),
        endDate: result.endDate ? new Date(result.endDate) : undefined,
        venue: result.venue || {
          id: result.venueId || 'unknown',
          name: result.venueName || '',
          address: result.venueAddress || '',
          city: result.venueCity || '',
          capacity: result.venueCapacity || 0
        },
        promoter: result.promoter || {
          id: result.promoterId || 'unknown',
          name: result.promoterName || 'Unknown',
          verified: false,
          followersCount: 0,
          image: '',
          description: ''
        },
        ticketTypes: result.ticketTypes || [],
        artists: result.artists || [],
        isSoldOut: result.isSoldOut || false,
      })) as Event[];
    } else if (allEventsData) {
      return allEventsData.map((e: any) => ({
        ...e,
        date: new Date(e.date),
        endDate: e.endDate ? new Date(e.endDate) : undefined,
      })) as Event[];
    }
    return [];
  }, [debouncedSearchQuery, searchResults, allEventsData]);

  const filteredEvents: Event[] = useMemo(() => {
    let events = [...baseEvents];
    const now = new Date();

    if (dateFilter === 'today') {
      events = events.filter(e => {
        const d = new Date(e.date);
        return d.toDateString() === now.toDateString();
      });
    } else if (dateFilter === 'week') {
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      events = events.filter(e => {
        const d = new Date(e.date);
        return d >= now && d <= weekLater;
      });
    } else if (dateFilter === 'month') {
      const monthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      events = events.filter(e => {
        const d = new Date(e.date);
        return d >= now && d <= monthLater;
      });
    }

    if (priceFilter === 'free') {
      events = events.filter(e => {
        if (!e.ticketTypes || e.ticketTypes.length === 0) return true;
        return Math.min(...e.ticketTypes.map(t => t.price)) === 0;
      });
    } else if (priceFilter === 'under20') {
      events = events.filter(e => {
        if (!e.ticketTypes || e.ticketTypes.length === 0) return true;
        return Math.min(...e.ticketTypes.map(t => t.price)) < 20;
      });
    } else if (priceFilter === 'under50') {
      events = events.filter(e => {
        if (!e.ticketTypes || e.ticketTypes.length === 0) return true;
        return Math.min(...e.ticketTypes.map(t => t.price)) < 50;
      });
    } else if (priceFilter === 'over50') {
      events = events.filter(e => {
        if (!e.ticketTypes || e.ticketTypes.length === 0) return false;
        return Math.min(...e.ticketTypes.map(t => t.price)) >= 50;
      });
    }

    if (cityFilters.length > 0) {
      events = events.filter(e =>
        cityFilters.some(city => e.venue?.city?.toLowerCase().includes(city.toLowerCase()))
      );
    }

    return events;
  }, [baseEvents, dateFilter, priceFilter, cityFilters]);

  const nearbyEvents: Event[] = useMemo(() => {
    if (!location) return [];
    return baseEvents
      .filter(e => e.coordinates)
      .map(e => ({
        ...e,
        _distance: getDistance(
          location.latitude,
          location.longitude,
          e.coordinates!.latitude,
          e.coordinates!.longitude
        ),
      }))
      .filter((e: any) => e._distance <= nearbyRadius)
      .sort((a: any, b: any) => a._distance - b._distance)
      .slice(0, 10);
  }, [baseEvents, location, nearbyRadius]);

  const eventsWithCoords = useMemo(() => {
    return filteredEvents.filter(e => e.coordinates);
  }, [filteredEvents]);

  const isLoading = isSearching || isLoadingEvents;
  const error = searchError || eventsError;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (debouncedSearchQuery.length > 0) {
        await refetchSearch();
      } else {
        await refetchEvents();
      }
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setRefreshing(false);
    }
  }, [debouncedSearchQuery, refetchSearch, refetchEvents]);

  const clearFilters = useCallback(() => {
    setDateFilter('all');
    setPriceFilter('all');
    setCityFilters([]);
  }, []);

  const { data: adsData } = api.advertisements.list.useQuery({ active: true });

  const activeAds: Advertisement[] = useMemo(() => {
    const adsList = (adsData as any)?.ads || (Array.isArray(adsData) ? adsData : []);
    console.log('[Search] ads loaded:', adsList?.length);
    if (!adsList || !Array.isArray(adsList) || adsList.length === 0) return [];
    const now = new Date();
    return adsList
      .filter((ad: any) => {
        const startDate = new Date(ad.start_date || ad.startDate || 0);
        const endDate = new Date(ad.end_date || ad.endDate || Date.now() + 365 * 86400000);
        return startDate <= now && endDate >= now;
      })
      .map((ad: any) => ({
        id: ad.id,
        title: ad.title || '',
        description: ad.description || '',
        image: ad.image || ad.image_url || '',
        targetUrl: ad.target_url || ad.targetUrl,
        type: ad.type || 'card',
        position: ad.position || 'search_results',
        isActive: true,
        startDate: new Date(ad.start_date || ad.startDate || Date.now()),
        endDate: new Date(ad.end_date || ad.endDate || Date.now()),
        impressions: ad.impressions || 0,
        clicks: ad.clicks || 0,
        budget: ad.budget || 0,
      })) as Advertisement[];
  }, [adsData]);

  const featuredEvents = filteredEvents.filter(e => e.isFeatured);


  const getMinPrice = (event: Event): string => {
    if (!event.ticketTypes || event.ticketTypes.length === 0) return 'Grátis';
    const min = Math.min(...event.ticketTypes.map(t => t.price));
    return min === 0 ? 'Grátis' : `€${min}`;
  };

  const FeaturedEventCard = ({ event }: { event: Event }) => (
    <TouchableOpacity
      style={s.featuredCard}
      onPress={() => router.push(`/event/${event.id}` as any)}
      activeOpacity={0.85}
    >
      <Image source={{ uri: event.image }} style={s.featuredCardImage} />
      {isFreeEvent(event) && (
        <View style={s.featuredFreeBadge} pointerEvents="none">
          <FreeBadge size="md" />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={s.featuredCardOverlay}
      >
        <View style={s.featuredCardContent}>
          <View style={[s.featuredBadge, { backgroundColor: colors.primary }]}>
            <Star size={10} color="#fff" fill="#fff" />
            <Text style={s.featuredBadgeText}>Destaque</Text>
          </View>
          <Text style={s.featuredCardTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={s.featuredCardMeta}>
            <View style={s.featuredMetaItem}>
              <Calendar size={13} color="#fff" />
              <Text style={s.featuredMetaText}>
                {new Date(event.date).toLocaleDateString('pt-PT', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
            </View>
            <View style={s.featuredMetaItem}>
              <MapPin size={13} color="#fff" />
              <Text style={s.featuredMetaText} numberOfLines={1}>
                {event.venue?.city || ''}
              </Text>
            </View>
            <Text style={s.featuredPriceText}>{getMinPrice(event)}</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const EventListCard = ({ event, distance }: { event: Event; distance?: number }) => (
    <TouchableOpacity
      style={[s.listEventCard, { backgroundColor: colors.card }]}
      onPress={() => router.push(`/event/${event.id}` as any)}
      activeOpacity={0.8}
    >
      <View style={s.listEventImageWrap}>
        <Image source={{ uri: event.image }} style={s.listEventImage} />
        {isFreeEvent(event) && (
          <View style={s.listEventFreeBadge} pointerEvents="none">
            <FreeBadge size="sm" />
          </View>
        )}
      </View>
      <View style={s.listEventInfo}>
        <Text style={[s.listEventTitle, { color: colors.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={s.listEventRow}>
          <Calendar size={12} color={colors.textSecondary} />
          <Text style={[s.listEventMeta, { color: colors.textSecondary }]}>
            {new Date(event.date).toLocaleDateString('pt-PT', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={s.listEventRow}>
          <MapPin size={12} color={colors.textSecondary} />
          <Text style={[s.listEventMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {event.venue?.city || event.venue?.name || ''}
          </Text>
          {distance != null && (
            <View style={[s.distanceBadge, { backgroundColor: colors.primary + '18' }]}>
              <Navigation size={10} color={colors.primary} />
              <Text style={[s.distanceText, { color: colors.primary }]}>
                {distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`}
              </Text>
            </View>
          )}
        </View>
        <View style={s.listEventBottom}>
          <View style={[s.priceBadge, { backgroundColor: COLORS.success + '15' }]}>
            <Text style={[s.priceText, { color: COLORS.success }]}>{getMinPrice(event)}</Text>
          </View>
          {event.isFeatured && (
            <View style={[s.featuredSmallBadge, { backgroundColor: '#FFD700' + '20' }]}>
              <Star size={10} color="#FFD700" fill="#FFD700" />
              <Text style={{ fontSize: 10, color: '#B8860B', fontWeight: '600' as const, marginLeft: 3 }}>Destaque</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const EventGridCard = ({ event }: { event: Event }) => (
    <TouchableOpacity
      style={[s.gridEventCard, { backgroundColor: colors.card }]}
      onPress={() => router.push(`/event/${event.id}` as any)}
      activeOpacity={0.8}
    >
      <View style={s.gridEventImageWrap}>
        <Image source={{ uri: event.image }} style={s.gridEventImage} />
        {isFreeEvent(event) && (
          <View style={s.gridEventFreeBadge} pointerEvents="none">
            <FreeBadge size="sm" />
          </View>
        )}
      </View>
      <View style={s.gridEventContent}>
        <Text style={[s.gridEventTitle, { color: colors.text }]} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={s.gridEventRow}>
          <Calendar size={11} color={colors.textSecondary} />
          <Text style={[s.gridEventMeta, { color: colors.textSecondary }]}>
            {new Date(event.date).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
        <View style={s.gridEventRow}>
          <MapPin size={11} color={colors.textSecondary} />
          <Text style={[s.gridEventMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {event.venue?.city || ''}
          </Text>
        </View>
        <View style={[s.priceBadge, { backgroundColor: COLORS.success + '15', marginTop: 6 }]}>
          <Text style={[s.priceText, { color: COLORS.success }]}>{getMinPrice(event)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const MapMarkerCard = ({ event, index }: { event: Event; index: number }) => (
    <TouchableOpacity
      key={event.id}
      style={[
        s.mapMarker,
        {
          top: `${15 + (index % 4) * 22}%`,
          left: `${8 + Math.floor(index / 4) * 30 + (index % 2) * 12}%`,
        },
      ]}
      onPress={() => router.push(`/event/${event.id}` as any)}
      activeOpacity={0.8}
    >
      <View style={[s.markerPin, { backgroundColor: colors.primary }]}>
        <MapPin size={18} color="#fff" />
      </View>
      <View style={[s.markerTooltip, { backgroundColor: colors.card }]}>
        <Text style={[s.markerTooltipTitle, { color: colors.text }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[s.markerTooltipPrice, { color: colors.primary }]}>
          {getMinPrice(event)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const filterMaxHeight = filterSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 340],
  });

  const filterOpacity = filterSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[s.searchHeaderArea, { backgroundColor: colors.background }]}>
        <View style={s.searchBarRow}>
          <View style={[s.searchInputWrapper, { backgroundColor: colors.card }]}>
            <SearchIcon size={18} color={colors.textSecondary} />
            <TextInput
              style={[s.searchInput, { color: colors.text }]}
              placeholder="Procurar eventos, artistas, locais..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={colors.textSecondary}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[
              s.filterToggleBtn,
              { backgroundColor: activeFilterCount > 0 ? colors.primary : colors.card },
            ]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal size={18} color={activeFilterCount > 0 ? '#fff' : colors.primary} />
            {activeFilterCount > 0 && (
              <View style={s.filterCountBadge}>
                <Text style={s.filterCountText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {suggestions && suggestions.length > 0 && debouncedSearchQuery.length >= 2 && (
          <View style={[s.suggestionsContainer, { backgroundColor: colors.card }]}>
            {suggestions.map((suggestion: string, index: number) => (
              <TouchableOpacity
                key={`sug-${index}`}
                style={[s.suggestionItem, { borderBottomColor: colors.border }]}
                onPress={() => setSearchQuery(suggestion)}
              >
                <SearchIcon size={14} color={colors.textSecondary} />
                <Text style={[s.suggestionText, { color: colors.text }]}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Animated.View style={[s.filtersPanel, { maxHeight: filterMaxHeight, opacity: filterOpacity }]}>
          <View style={s.filterSection}>
            <Text style={[s.filterSectionTitle, { color: colors.text }]}>Data</Text>
            <View style={s.filterChipsRow}>
              {[
                { id: 'all' as const, label: 'Qualquer' },
                { id: 'today' as const, label: 'Hoje' },
                { id: 'week' as const, label: 'Esta semana' },
                { id: 'month' as const, label: 'Este mês' },
              ].map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    s.filterChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    dateFilter === item.id && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setDateFilter(item.id)}
                >
                  <Text
                    style={[
                      s.filterChipText,
                      { color: colors.textSecondary },
                      dateFilter === item.id && { color: '#fff' },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.filterSection}>
            <Text style={[s.filterSectionTitle, { color: colors.text }]}>Preço</Text>
            <View style={s.filterChipsRow}>
              {[
                { id: 'all' as const, label: 'Qualquer' },
                { id: 'free' as const, label: 'Grátis' },
                { id: 'under20' as const, label: '< €20' },
                { id: 'under50' as const, label: '< €50' },
                { id: 'over50' as const, label: '€50+' },
              ].map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    s.filterChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    priceFilter === item.id && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setPriceFilter(item.id)}
                >
                  <Text
                    style={[
                      s.filterChipText,
                      { color: colors.textSecondary },
                      priceFilter === item.id && { color: '#fff' },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.filterSection}>
            <Text style={[s.filterSectionTitle, { color: colors.text }]}>Localização</Text>
            <TouchableOpacity
              style={[s.cityPickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowCityPicker(true)}
            >
              <MapPin size={14} color={colors.primary} />
              <Text style={[s.cityPickerText, { color: cityFilters.length === 0 ? colors.textSecondary : colors.text }]} numberOfLines={1}>
                {cityFilters.length === 0 ? 'Todas as cidades' : cityFilters.join(', ')}
              </Text>
              <ChevronDown size={14} color={colors.textSecondary} />
            </TouchableOpacity>
            {cityFilters.length > 0 && (
              <View style={s.selectedCitiesRow}>
                {cityFilters.map(city => (
                  <TouchableOpacity
                    key={city}
                    style={[s.selectedCityChip, { backgroundColor: colors.primary + '18', borderColor: colors.primary }]}
                    onPress={() => setCityFilters(prev => prev.filter(c => c !== city))}
                  >
                    <Text style={[s.selectedCityChipText, { color: colors.primary }]}>{city}</Text>
                    <X size={12} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {activeFilterCount > 0 && (
            <TouchableOpacity style={s.clearFiltersBtn} onPress={clearFilters}>
              <X size={14} color={colors.error} />
              <Text style={[s.clearFiltersText, { color: colors.error }]}>Limpar filtros</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        <View style={s.controlsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.categoriesContent}
          >
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  s.categoryPill,
                  { backgroundColor: isDark ? colors.card : '#f5f5f5' },
                  selectedCategory === cat.id && { backgroundColor: colors.primary },
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text style={s.categoryPillIcon}>{cat.icon}</Text>
                <Text
                  style={[
                    s.categoryPillLabel,
                    { color: colors.text },
                    selectedCategory === cat.id && { color: '#fff' },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.viewToggle}>
            <TouchableOpacity
              style={[s.viewToggleBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}
              onPress={() => setViewMode('list')}
            >
              <List size={16} color={viewMode === 'list' ? '#fff' : colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.viewToggleBtn, viewMode === 'map' && { backgroundColor: colors.primary }]}
              onPress={() => setViewMode('map')}
            >
              <Map size={16} color={viewMode === 'map' ? '#fff' : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {error && (
        <View style={s.errorContainer}>
          <ErrorState
            message={handleError(error)}
            onRetry={isRetryableError(error) ? () => {
              if (debouncedSearchQuery.length > 0) { void refetchSearch(); }
              else { void refetchEvents(); }
            } : undefined}
          />
        </View>
      )}

      {viewMode === 'map' ? (
        <View style={s.mapViewContainer}>
          <View style={[s.interactiveMap, { backgroundColor: isDark ? '#1a2a35' : '#e8f4f6' }]}>
            <LinearGradient
              colors={isDark ? ['#0d1b2a', '#1b3a4b'] : ['#d0ecf0', '#e8f4f6']}
              style={s.mapGradient}
            >
              <View style={s.mapHeaderBar}>
                <Compass size={18} color={colors.primary} />
                <Text style={[s.mapTitle, { color: colors.text }]}>Mapa de Eventos</Text>
                <Text style={[s.mapSubtitle, { color: colors.textSecondary }]}>
                  {eventsWithCoords.length} eventos no mapa
                </Text>
              </View>
              <View style={s.mapPinsArea}>
                {eventsWithCoords.slice(0, 8).map((event, index) => (
                  <MapMarkerCard key={event.id} event={event} index={index} />
                ))}
                {eventsWithCoords.length === 0 && (
                  <View style={s.mapEmptyMsg}>
                    <MapPin size={32} color={colors.textSecondary} />
                    <Text style={[s.mapEmptyText, { color: colors.textSecondary }]}>
                      Sem eventos com localização
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>
          <ScrollView style={s.mapEventsList} showsVerticalScrollIndicator={false}>
            {eventsWithCoords.length > 0 ? (
              eventsWithCoords.map(event => (
                <EventListCard key={event.id} event={event} />
              ))
            ) : (
              filteredEvents.map(event => (
                <EventListCard key={event.id} event={event} />
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          style={s.contentScroll}
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
          {isLoading && !refreshing ? (
            <View style={s.loadingContainer}>
              <EventListSkeleton count={3} />
            </View>
          ) : (
            <View style={s.eventsContent}>
              <View style={[s.nearbySection, { backgroundColor: isDark ? '#0d2229' : '#edf9fb' }]}>
                <View style={s.nearbySectionHeader}>
                  <View style={s.nearbySectionTitleRow}>
                    <Navigation size={18} color={colors.primary} />
                    <Text style={[s.nearbySectionTitle, { color: colors.text }]}>Perto de mim</Text>
                  </View>
                  {!location && (
                    <TouchableOpacity
                      style={[s.enableLocationBtn, { backgroundColor: colors.primary }]}
                      onPress={requestLocation}
                      disabled={locationLoading}
                    >
                      <Compass size={14} color="#fff" />
                      <Text style={s.enableLocationText}>
                        {locationLoading ? 'A localizar...' : 'Ativar localização'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {location ? (
                  nearbyEvents.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.nearbyScroll}>
                      {nearbyEvents.map(event => {
                        const dist = event.coordinates
                          ? getDistance(location.latitude, location.longitude, event.coordinates.latitude, event.coordinates.longitude)
                          : undefined;
                        return (
                          <TouchableOpacity
                            key={event.id}
                            style={[s.nearbyCard, { backgroundColor: colors.card }]}
                            onPress={() => router.push(`/event/${event.id}` as any)}
                            activeOpacity={0.85}
                          >
                            <Image source={{ uri: event.image }} style={s.nearbyCardImage} />
                            <View style={s.nearbyCardBody}>
                              <Text style={[s.nearbyCardTitle, { color: colors.text }]} numberOfLines={1}>
                                {event.title}
                              </Text>
                              <View style={s.nearbyCardRow}>
                                <MapPin size={11} color={colors.textSecondary} />
                                <Text style={[s.nearbyCardText, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {event.venue?.city || ''}
                                </Text>
                              </View>
                              {dist != null && (
                                <View style={[s.distanceBadge, { backgroundColor: colors.primary + '18' }]}>
                                  <Navigation size={9} color={colors.primary} />
                                  <Text style={[s.distanceText, { color: colors.primary }]}>
                                    {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={s.nearbyEmpty}>
                      <Text style={[s.nearbyEmptyText, { color: colors.textSecondary }]}>
                        Sem eventos perto da tua localização ({nearbyRadius}km)
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={s.nearbyEmpty}>
                    <Text style={[s.nearbyEmptyText, { color: colors.textSecondary }]}>
                      {locationError || 'Ativa a localização para ver eventos perto de ti'}
                    </Text>
                  </View>
                )}
              </View>

              {activeAds.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <AdBanner advertisement={activeAds[0]} />
                </View>
              )}

              {featuredEvents.length > 0 && (
                <View style={s.sectionBlock}>
                  <Text style={[s.sectionTitle, { color: colors.text }]}>Em Destaque</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.featuredScroll}
                  >
                    {featuredEvents.map((event: Event) => (
                      <FeaturedEventCard key={event.id} event={event} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {activeAds.length > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <AdBanner advertisement={activeAds[1]} />
                </View>
              )}

              {filteredEvents.length > 0 ? (
                <View style={s.sectionBlock}>
                  <View style={s.sectionHeaderRow}>
                    <Text style={[s.sectionTitle, { color: colors.text }]}>
                      {debouncedSearchQuery ? 'Resultados' : 'Todos os Eventos'}
                    </Text>
                    <Text style={[s.resultCount, { color: colors.textSecondary }]}>
                      {filteredEvents.length} {filteredEvents.length === 1 ? 'evento' : 'eventos'}
                    </Text>
                  </View>
                  <View style={s.eventsGrid}>
                    {filteredEvents.map((event: Event) => (
                      <EventGridCard key={event.id} event={event} />
                    ))}
                  </View>
                </View>
              ) : (
                <View style={s.emptySearch}>
                  <SearchIcon size={56} color={colors.textSecondary} />
                  <Text style={[s.emptySearchText, { color: colors.text }]}>Nenhum evento encontrado</Text>
                  <Text style={[s.emptySearchSubtext, { color: colors.textSecondary }]}>
                    Tenta ajustar os filtros ou a pesquisa
                  </Text>
                  {activeFilterCount > 0 && (
                    <TouchableOpacity style={[s.clearFiltersBtnLarge, { borderColor: colors.primary }]} onPress={clearFilters}>
                      <Text style={[s.clearFiltersBtnLargeText, { color: colors.primary }]}>Limpar filtros</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={showCityPicker} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Selecionar cidades</Text>
              <TouchableOpacity onPress={() => setShowCityPicker(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {cityFilters.length > 0 && (
              <View style={s.modalSelectedInfo}>
                <Text style={[s.modalSelectedText, { color: colors.primary }]}>
                  {cityFilters.length} {cityFilters.length === 1 ? 'cidade selecionada' : 'cidades selecionadas'}
                </Text>
                <TouchableOpacity onPress={() => setCityFilters([])}>
                  <Text style={[s.modalClearText, { color: colors.error }]}>Limpar</Text>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              {MADEIRA_MUNICIPALITIES.filter(c => c !== 'Todas').map(city => {
                const isSelected = cityFilters.includes(city);
                return (
                  <TouchableOpacity
                    key={city}
                    style={[
                      s.cityOption,
                      { borderBottomColor: colors.border },
                      isSelected && { backgroundColor: colors.primary + '12' },
                    ]}
                    onPress={() => {
                      setCityFilters(prev =>
                        isSelected
                          ? prev.filter(c => c !== city)
                          : [...prev, city]
                      );
                    }}
                  >
                    <View style={[
                      s.cityCheckbox,
                      { borderColor: isSelected ? colors.primary : colors.border },
                      isSelected && { backgroundColor: colors.primary },
                    ]}>
                      {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                    </View>
                    <MapPin size={16} color={isSelected ? colors.primary : colors.textSecondary} />
                    <Text
                      style={[
                        s.cityOptionText,
                        { color: colors.text },
                        isSelected && { color: colors.primary, fontWeight: '700' as const },
                      ]}
                    >
                      {city}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={[s.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[s.modalConfirmBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowCityPicker(false)}
              >
                <Text style={s.modalConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AdminUsersContent() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'normal' | 'promoter' | 'admin'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [users] = useState<AdminUser[]>([
    {
      id: '1',
      name: 'João Silva',
      email: 'joao.silva@email.com',
      phone: '+351 912 345 678',
      userType: 'promoter',
      location: 'Lisboa',
      joinDate: '2023-05-15',
      lastActive: '2024-01-15T10:30:00Z',
      isActive: true,
      eventsCreated: 12,
      totalSpent: 0,
      isVerified: true,
    },
    {
      id: '2',
      name: 'Maria Santos',
      email: 'maria.santos@email.com',
      phone: '+351 923 456 789',
      userType: 'normal',
      location: 'Porto',
      joinDate: '2023-08-20',
      lastActive: '2024-01-14T15:45:00Z',
      isActive: true,
      eventsAttended: 25,
      totalSpent: 450,
      isVerified: true,
    },
    {
      id: '3',
      name: 'Carlos Oliveira',
      email: 'carlos.oliveira@email.com',
      userType: 'normal',
      location: 'Coimbra',
      joinDate: '2023-12-01',
      lastActive: '2024-01-10T09:15:00Z',
      isActive: false,
      eventsAttended: 8,
      totalSpent: 120,
      isVerified: false,
    },
    {
      id: '4',
      name: 'Ana Costa',
      email: 'ana.costa@email.com',
      phone: '+351 934 567 890',
      userType: 'promoter',
      location: 'Braga',
      joinDate: '2023-03-10',
      lastActive: '2024-01-13T14:20:00Z',
      isActive: true,
      eventsCreated: 8,
      totalSpent: 0,
      isVerified: true,
    },
    {
      id: '5',
      name: 'Admin User',
      email: 'admin@lyven.com',
      userType: 'admin',
      joinDate: '2023-01-01',
      lastActive: '2024-01-15T16:00:00Z',
      isActive: true,
      isVerified: true,
    }
  ]);

  const getUserTypeLabel = (type: string) => {
    switch (type) {
      case 'normal': return 'Utilizador';
      case 'promoter': return 'Promotor';
      case 'admin': return 'Admin';
      default: return type;
    }
  };

  const getUserTypeColor = (type: string) => {
    switch (type) {
      case 'normal': return colors.primary;
      case 'promoter': return colors.warning;
      case 'admin': return colors.error;
      default: return '#999';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-PT');
  };

  const formatLastActive = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Agora mesmo';
    if (diffInHours < 24) return `Há ${diffInHours}h`;
    if (diffInHours < 48) return 'Ontem';
    return formatDate(dateString);
  };

  const handleUserAction = (userId: string, action: 'suspend' | 'activate' | 'verify' | 'promote') => {
    const userToAction = users.find(u => u.id === userId);
    if (!userToAction) return;

    let title = '';
    let message = '';

    switch (action) {
      case 'suspend':
        title = 'Suspender Utilizador';
        message = `Tem certeza que deseja suspender ${userToAction.name}?`;
        break;
      case 'activate':
        title = 'Ativar Utilizador';
        message = `Tem certeza que deseja ativar ${userToAction.name}?`;
        break;
      case 'verify':
        title = 'Verificar Utilizador';
        message = `Tem certeza que deseja verificar ${userToAction.name}?`;
        break;
      case 'promote':
        title = 'Promover a Promotor';
        message = `Tem certeza que deseja promover ${userToAction.name} a promotor?`;
        break;
    }

    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: () => {
          Alert.alert('Sucesso', `Ação realizada com sucesso!`);
        }
      }
    ]);
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || u.userType === filterType;
    return matchesSearch && matchesFilter;
  });

  const UserCard = ({ user: u }: { user: AdminUser }) => (
    <View style={[styles.userCard, { backgroundColor: colors.card }]}>
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={[styles.userName, { color: colors.text }]}>{u.name}</Text>
            {u.isVerified && (
              <UserCheck size={16} color={COLORS.success} />
            )}
          </View>
          <View style={[styles.userTypeBadge, { backgroundColor: getUserTypeColor(u.userType) + '20' }]}>
            <Text style={[styles.userTypeText, { color: getUserTypeColor(u.userType) }]}>
              {getUserTypeLabel(u.userType)}
            </Text>
          </View>
        </View>
        <View style={styles.userActions}>
          <View style={[
            styles.statusIndicator,
            { backgroundColor: u.isActive ? COLORS.success : COLORS.error }
          ]} />
          <TouchableOpacity style={styles.moreButton}>
            <MoreVertical size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.userDetails}>
        <View style={styles.detailRow}>
          <Mail size={14} color={colors.textSecondary} />
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>{u.email}</Text>
        </View>
        {u.phone && (
          <View style={styles.detailRow}>
            <Phone size={14} color={colors.textSecondary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{u.phone}</Text>
          </View>
        )}
        {u.location && (
          <View style={styles.detailRow}>
            <MapPin size={14} color={colors.textSecondary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{u.location}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Calendar size={14} color={colors.textSecondary} />
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>Membro desde {formatDate(u.joinDate)}</Text>
        </View>
      </View>

      <View style={styles.userStats}>
        {u.userType === 'promoter' && (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{u.eventsCreated || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Eventos Criados</Text>
          </View>
        )}
        {u.userType === 'normal' && (
          <>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{u.eventsAttended || 0}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Eventos</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>€{u.totalSpent || 0}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Gasto Total</Text>
            </View>
          </>
        )}
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{formatLastActive(u.lastActive)}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Última Atividade</Text>
        </View>
      </View>

      <View style={styles.userActionButtons}>
        {!u.isActive ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.activateButton]}
            onPress={() => handleUserAction(u.id, 'activate')}
          >
            <UserCheck size={16} color={COLORS.white} />
            <Text style={styles.actionButtonText}>Ativar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.suspendButton]}
            onPress={() => handleUserAction(u.id, 'suspend')}
          >
            <UserX size={16} color={COLORS.white} />
            <Text style={styles.actionButtonText}>Suspender</Text>
          </TouchableOpacity>
        )}
        
        {!u.isVerified && (
          <TouchableOpacity
            style={[styles.actionButton, styles.verifyButton]}
            onPress={() => handleUserAction(u.id, 'verify')}
          >
            <UserCheck size={16} color={COLORS.white} />
            <Text style={styles.actionButtonText}>Verificar</Text>
          </TouchableOpacity>
        )}

        {u.userType === 'normal' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.promoteButton]}
            onPress={() => handleUserAction(u.id, 'promote')}
          >
            <Crown size={16} color={COLORS.white} />
            <Text style={styles.actionButtonText}>Promover</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const promoters = users.filter(u => u.userType === 'promoter').length;
  const normalUsers = users.filter(u => u.userType === 'normal').length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <View style={[styles.searchInputContainer, { backgroundColor: colors.card }]}>
            <SearchIcon size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Procurar utilizadores..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <TouchableOpacity
            style={[styles.filterButton, { backgroundColor: colors.card }]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filterOptions}>
            {['all', 'normal', 'promoter', 'admin'].map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterOption,
                  { backgroundColor: colors.border },
                  filterType === type && { backgroundColor: colors.primary }
                ]}
                onPress={() => setFilterType(type as any)}
              >
                <Text style={[
                  styles.filterOptionText,
                  { color: colors.textSecondary },
                  filterType === type && styles.filterOptionTextActive
                ]}>
                  {type === 'all' ? 'Todos' : getUserTypeLabel(type)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{totalUsers}</Text>
            <Text style={[styles.statCardLabel, { color: colors.textSecondary }]}>Total</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{activeUsers}</Text>
            <Text style={[styles.statCardLabel, { color: colors.textSecondary }]}>Ativos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: COLORS.warning }]}>{promoters}</Text>
            <Text style={[styles.statCardLabel, { color: colors.textSecondary }]}>Promotores</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.statNumber, { color: COLORS.info }]}>{normalUsers}</Text>
            <Text style={[styles.statCardLabel, { color: colors.textSecondary }]}>Utilizadores</Text>
          </View>
        </View>

        <ScrollView style={styles.usersList} showsVerticalScrollIndicator={false}>
          {filteredUsers.map(u => (
            <UserCard key={u.id} user={u} />
          ))}
          {filteredUsers.length === 0 && (
            <View style={styles.emptyState}>
              <Users size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>Nenhum utilizador encontrado</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function PromoterEventsContent() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { colors, isDark } = useTheme();
  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'past'>('upcoming');

  const { data: profileByUser } = api.promoters.getByUserId.useQuery(
    { userId: user?.id ?? '' },
    { enabled: !!user?.id }
  );
  const promoterId = profileByUser?.id ?? null;
  const { data: eventsData, isLoading, error, refetch } = api.events.list.useQuery(
    promoterId ? { promoterId } : (undefined as any),
    { enabled: !!promoterId }
  );

  const allEvents: Event[] = useMemo(() => {
    if (!eventsData) return [];
    return eventsData.map((e: any) => ({
      ...e,
      date: new Date(e.date),
      endDate: e.endDate ? new Date(e.endDate) : undefined,
      venue: typeof e.venue === 'object' && e.venue
        ? { id: (e.venue as any).id ?? '', name: (e.venue as any).name ?? '', address: (e.venue as any).address ?? '', city: (e.venue as any).city ?? '', capacity: (e.venue as any).capacity ?? 0 }
        : { id: '', name: '', address: '', city: '', capacity: 0 },
      promoter: typeof e.promoter === 'object' && e.promoter
        ? { id: (e.promoter as any).id ?? '', name: (e.promoter as any).name ?? '', image: (e.promoter as any).image ?? '', description: (e.promoter as any).description ?? '', verified: !!(e.promoter as any).verified, followersCount: (e.promoter as any).followersCount ?? 0 }
        : { id: user?.id ?? '', name: user?.name ?? 'Promotor', image: '', description: '', verified: false, followersCount: 0 },
    })) as Event[];
  }, [eventsData, user?.id, user?.name]);

  const now = new Date();
  const upcomingEvents = allEvents.filter(event => new Date(event.date) >= now);
  const pastEvents = allEvents.filter(event => new Date(event.date) < now);

  const handleDeleteEvent = (eventId: string) => {
    Alert.alert(
      'Eliminar Evento',
      'Tem certeza que deseja eliminar este evento? Esta ação não pode ser desfeita.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            console.log('Eliminar evento:', eventId);
          },
        },
      ]
    );
  };

  const EventCard = ({ event }: { event: Event }) => {
    const totalTickets = event.ticketTypes?.reduce((s: number, t: any) => s + (t.available ?? 0), 0) ?? event.venue?.capacity ?? 0;
    const soldTickets = 0;
    const revenue = 0;
    const views = 0;

    return (
      <View style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Image source={{ uri: event.image }} style={styles.eventImage} />
        
        <View style={styles.eventContent}>
          <View style={styles.eventHeader}>
            <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
            <View style={styles.eventActions}>
              <TouchableOpacity
                style={[styles.actionButtonIcon, { backgroundColor: isDark ? colors.border : '#f8f9fa' }]}
                onPress={() => router.push(`/event-buyers/${event.id}` as any)}
              >
                <Eye size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButtonIcon, { backgroundColor: isDark ? colors.border : '#f8f9fa' }]}
                onPress={() => console.log('Editar evento:', event.id)}
              >
                <Edit3 size={18} color="#FFD700" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButtonIcon, { backgroundColor: isDark ? colors.border : '#f8f9fa' }]}
                onPress={() => handleDeleteEvent(event.id)}
              >
                <Trash2 size={18} color="#FF385C" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.eventInfo}>
            <View style={styles.infoRow}>
              <Calendar size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {new Date(event.date).toLocaleDateString('pt-PT', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
            
            <View style={styles.infoRow}>
              <Clock size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {new Date(event.date).toLocaleTimeString('pt-PT', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <MapPin size={16} color={colors.textSecondary} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>{event.venue.name}</Text>
            </View>
          </View>

          <View style={[styles.eventStats, { backgroundColor: colors.background }]}>
            <View style={styles.statItem}>
              <Users size={16} color="#4CAF50" />
              <Text style={[styles.statValue, { color: colors.text }]}>{soldTickets}/{totalTickets}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Bilhetes</Text>
            </View>
            
            <View style={styles.statItem}>
              <DollarSign size={16} color="#FFD700" />
              <Text style={[styles.statValue, { color: colors.text }]}>€{revenue.toLocaleString('pt-PT')}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Receita</Text>
            </View>
            
            <View style={styles.statItem}>
              <Eye size={16} color="#2196F3" />
              <Text style={[styles.statValue, { color: colors.text }]}>{views.toLocaleString('pt-PT')}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Visualizações</Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${Math.min((soldTickets / (totalTickets || 1)) * 100, 100)}%`, backgroundColor: colors.primary }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {Math.round((soldTickets / (totalTickets || 1)) * 100)}% vendidos
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const TabButton = ({ tab, title, isActive }: { tab: 'upcoming' | 'past'; title: string; isActive: boolean }) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        { backgroundColor: colors.card },
        isActive && { backgroundColor: colors.primary }
      ]}
      onPress={() => setSelectedTab(tab)}
    >
      <Text style={[styles.tabButtonText, isActive && styles.activeTabButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const currentEvents = selectedTab === 'upcoming' ? upcomingEvents : pastEvents;

  if (user?.id && profileByUser === undefined) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <LoadingSpinner message="A carregar perfil..." />
      </View>
    );
  }
  if (promoterId && error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ErrorState message={handleError(error)} onRetry={() => refetch()} />
      </View>
    );
  }
  if (promoterId && isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <LoadingSpinner message="A carregar eventos..." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.tabContainer, { borderBottomColor: colors.border }]}>
        <TabButton 
          tab="upcoming" 
          title={`Próximos (${upcomingEvents.length})`} 
          isActive={selectedTab === 'upcoming'} 
        />
        <TabButton 
          tab="past" 
          title={`Passados (${pastEvents.length})`} 
          isActive={selectedTab === 'past'} 
        />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {currentEvents.length > 0 ? (
          currentEvents.map((event: Event) => (
            <EventCard key={event.id} event={event} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Calendar size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {selectedTab === 'upcoming' ? 'Nenhum evento próximo' : 'Nenhum evento passado'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {selectedTab === 'upcoming' 
                ? 'Crie seu primeiro evento para começar a vender ingressos'
                : 'Seus eventos passados aparecerão aqui'
              }
            </Text>
          </View>
        )}
      </ScrollView>
      
      <TouchableOpacity 
        style={[styles.floatingButton, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/create-event' as any)}
      >
        <Plus size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default function SearchScreen() {
  return <SearchContent />;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  searchHeaderArea: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, zIndex: 10 },
  searchBarRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  searchInput: { flex: 1, fontSize: 15 },
  filterToggleBtn: { borderRadius: 12, padding: 11, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  filterCountBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  filterCountText: { color: '#fff', fontSize: 9, fontWeight: 'bold' as const },
  suggestionsContainer: { borderRadius: 12, marginTop: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 6, zIndex: 1000 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 1 },
  suggestionText: { fontSize: 14, flex: 1 },
  filtersPanel: { overflow: 'hidden', paddingHorizontal: 4, marginTop: 8 },
  filterSection: { marginBottom: 14 },
  filterSectionTitle: { fontSize: 13, fontWeight: '700' as const, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  filterChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 13, fontWeight: '500' as const },
  cityPickerBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderWidth: 1 },
  cityPickerText: { flex: 1, fontSize: 14 },
  clearFiltersBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 4 },
  clearFiltersText: { fontSize: 13, fontWeight: '600' as const },
  controlsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 4, gap: 8 },
  categoriesContent: { paddingRight: 8, gap: 8 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, gap: 4 },
  categoryPillIcon: { fontSize: 16 },
  categoryPillLabel: { fontSize: 12, fontWeight: '600' as const },
  viewToggle: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', gap: 2 },
  viewToggleBtn: { padding: 8, borderRadius: 8 },
  errorContainer: { padding: 16 },
  contentScroll: { flex: 1 },
  eventsContent: { paddingBottom: 30 },
  nearbySection: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 16, marginBottom: 8 },
  nearbySectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  nearbySectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nearbySectionTitle: { fontSize: 17, fontWeight: '700' as const },
  enableLocationBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
  enableLocationText: { color: '#fff', fontSize: 12, fontWeight: '600' as const },
  nearbyScroll: { gap: 12 },
  nearbyCard: { width: 160, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  nearbyCardImage: { width: '100%', height: 100, resizeMode: 'cover' },
  nearbyCardBody: { padding: 10 },
  nearbyCardTitle: { fontSize: 13, fontWeight: '600' as const, marginBottom: 4 },
  nearbyCardRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  nearbyCardText: { fontSize: 11, flex: 1 },
  nearbyEmpty: { alignItems: 'center', paddingVertical: 16 },
  nearbyEmptyText: { fontSize: 13, textAlign: 'center' },
  distanceBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 3, marginLeft: 4 },
  distanceText: { fontSize: 10, fontWeight: '600' as const },
  sectionBlock: { marginTop: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700' as const, marginBottom: 12, paddingHorizontal: 16 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  resultCount: { fontSize: 13 },
  featuredScroll: { paddingHorizontal: 16, gap: 14 },
  featuredCard: { width: 280, height: 180, borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 },
  featuredCardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  featuredFreeBadge: { position: 'absolute', top: 10, left: 10, zIndex: 3 },
  featuredCardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%', justifyContent: 'flex-end' },
  featuredCardContent: { padding: 14 },
  featuredBadge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, gap: 4, marginBottom: 6 },
  featuredBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' as const },
  featuredCardTitle: { fontSize: 17, fontWeight: 'bold' as const, color: '#fff', marginBottom: 6 },
  featuredCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featuredMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featuredMetaText: { fontSize: 12, color: '#fff', fontWeight: '500' as const },
  featuredPriceText: { fontSize: 13, color: '#fff', fontWeight: 'bold' as const, marginLeft: 'auto' },
  eventsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  gridEventCard: { width: '48%', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2, marginBottom: 4 },
  gridEventImageWrap: { position: 'relative' },
  gridEventImage: { width: '100%', height: 120, resizeMode: 'cover' },
  gridEventFreeBadge: { position: 'absolute', top: 6, left: 6 },
  gridEventContent: { padding: 10 },
  gridEventTitle: { fontSize: 13, fontWeight: '600' as const, marginBottom: 6, minHeight: 32 },
  gridEventRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  gridEventMeta: { fontSize: 11, flex: 1 },
  listEventCard: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  listEventImageWrap: { position: 'relative' },
  listEventImage: { width: 90, height: 90, resizeMode: 'cover' },
  listEventFreeBadge: { position: 'absolute', top: 6, left: 6 },
  listEventInfo: { flex: 1, padding: 10, justifyContent: 'center' },
  listEventTitle: { fontSize: 14, fontWeight: '600' as const, marginBottom: 4 },
  listEventRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  listEventMeta: { fontSize: 11, flex: 1 },
  listEventBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  priceText: { fontSize: 12, fontWeight: 'bold' as const },
  featuredSmallBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  emptySearch: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptySearchText: { fontSize: 18, fontWeight: 'bold' as const, marginTop: 16, textAlign: 'center' },
  emptySearchSubtext: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  clearFiltersBtnLarge: { marginTop: 16, borderWidth: 1, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  clearFiltersBtnLargeText: { fontSize: 14, fontWeight: '600' as const },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  mapViewContainer: { flex: 1 },
  interactiveMap: { margin: 12, borderRadius: 16, overflow: 'hidden', minHeight: 280 },
  mapGradient: { flex: 1, minHeight: 280 },
  mapHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  mapTitle: { fontSize: 16, fontWeight: '700' as const },
  mapSubtitle: { fontSize: 12, marginLeft: 'auto' },
  mapPinsArea: { flex: 1, position: 'relative', minHeight: 220 },
  mapMarker: { position: 'absolute', alignItems: 'center', zIndex: 5 },
  markerPin: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  markerTooltip: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, maxWidth: 110, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3 },
  markerTooltipTitle: { fontSize: 10, fontWeight: '600' as const },
  markerTooltipPrice: { fontSize: 10, fontWeight: 'bold' as const, marginTop: 1 },
  mapEmptyMsg: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 40 },
  mapEmptyText: { fontSize: 14, marginTop: 8 },
  mapEventsList: { flex: 1, paddingTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 17, fontWeight: '700' as const },
  cityOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  cityOptionText: { fontSize: 15, flex: 1 },
  cityCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  selectedCitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  selectedCityChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, gap: 4 },
  selectedCityChipText: { fontSize: 12, fontWeight: '600' as const },
  modalSelectedInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalSelectedText: { fontSize: 13, fontWeight: '600' as const },
  modalClearText: { fontSize: 13, fontWeight: '600' as const },
  modalFooter: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
  modalConfirmBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 20 },
  searchContainer: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  searchInput: { flex: 1, fontSize: 16 },
  filterButton: { borderRadius: 12, padding: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  filterOptions: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  filterOption: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  filterOptionText: { fontSize: 14 },
  filterOptionTextActive: { color: COLORS.white, fontWeight: 'bold' as const },
  statsContainer: { flexDirection: 'row', marginBottom: 20, gap: 10 },
  statCard: { flex: 1, borderRadius: 12, padding: 15, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  statNumber: { fontSize: 20, fontWeight: 'bold' as const, marginBottom: 5 },
  statCardLabel: { fontSize: 12 },
  usersList: { flex: 1 },
  userCard: { borderRadius: 12, padding: 15, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  userName: { fontSize: 18, fontWeight: 'bold' as const },
  userTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  userTypeText: { fontSize: 12, fontWeight: 'bold' as const },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIndicator: { width: 10, height: 10, borderRadius: 5 },
  moreButton: { padding: 5 },
  userDetails: { marginBottom: 15, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 14 },
  userStats: { flexDirection: 'row', marginBottom: 15, gap: 15 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: 'bold' as const, marginBottom: 2 },
  statLabel: { fontSize: 12 },
  userActionButtons: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
  suspendButton: { backgroundColor: COLORS.error },
  activateButton: { backgroundColor: COLORS.success },
  verifyButton: { backgroundColor: COLORS.info },
  promoteButton: { backgroundColor: COLORS.warning },
  actionButtonText: { color: COLORS.white, fontSize: 14, fontWeight: 'bold' as const },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyStateText: { fontSize: 16, marginTop: 10 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  tabButton: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginHorizontal: 4, alignItems: 'center' },
  tabButtonText: { color: '#999', fontSize: 16, fontWeight: '600' as const },
  activeTabButtonText: { color: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  eventCard: { borderRadius: 16, marginBottom: 20, overflow: 'hidden', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  eventImage: { width: '100%', height: 200, resizeMode: 'cover' },
  eventContent: { padding: 16 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  eventTitle: { fontSize: 18, fontWeight: 'bold' as const, flex: 1, marginRight: 12 },
  eventActions: { flexDirection: 'row', gap: 8 },
  actionButtonIcon: { padding: 8, borderRadius: 8 },
  eventInfo: { marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoText: { fontSize: 14, marginLeft: 8, flex: 1 },
  eventStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, paddingVertical: 12, borderRadius: 8 },
  progressContainer: { marginTop: 8 },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 12, textAlign: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: 'bold' as const, marginTop: 20, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 16, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  floatingButton: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
});
