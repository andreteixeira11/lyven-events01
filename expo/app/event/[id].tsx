import { StyleSheet, Text, View, ScrollView, Image, TouchableOpacity, SafeAreaView, Platform, Alert, ActionSheetIOS } from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { Calendar, MapPin, ChevronLeft, Share2, Heart, Bell, Clock, Instagram, Facebook, Globe, UserPlus } from "lucide-react-native";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { handleError } from "@/lib/error-handler";
import { LoadingSpinner, ErrorState } from "@/components/LoadingStates";
import { LinearGradient } from "expo-linear-gradient";
import { useCart } from "@/hooks/cart-context";
import { useFavorites } from "@/hooks/favorites-context";
import { useCalendar } from "@/hooks/calendar-context";
import { shareEvent as shareEventUtil, shareEventWithImage } from '@/lib/share-utils';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/theme-context';
import { useUser } from '@/hooks/user-context';
import { hp, responsiveFontSize, responsiveSpacing, moderateScale } from '@/utils/responsive-styles';
import { SocialProof } from '@/components/SocialProof';
import { FOMOAlert } from '@/components/FOMOAlert';
import { SeatMap, BALTAZAR_DIAS_SEAT_MAP } from '@/components/SeatMap';
import { isBaltazarDiasVenue } from '@/constants/venue-seat-maps';
import { useQueryClient } from '@tanstack/react-query';


export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const { addToCart } = useCart();
  const { isFavorite, addToFavorites, removeFromFavorites } = useFavorites();
  const { addToCalendar, setReminder, hasReminder, isEventInCalendar } = useCalendar();
  const { colors } = useTheme();
  const { user } = useUser();
  const queryClient = useQueryClient();
  
  const [selectedTickets, setSelectedTickets] = useState<{ [key: string]: number }>({});
  const [isLiked, setIsLiked] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [seatMapVisible, setSeatMapVisible] = useState(false);

  const { 
    data: eventData, 
    isLoading, 
    error,
    refetch 
  } = api.events.get.useQuery(
    { id: id as string },
    { 
      enabled: !!id,
      retry: 2,
    }
  );

  const event = eventData ? {
    id: eventData.id,
    title: eventData.title,
    description: eventData.description,
    image: eventData.image,
    date: new Date(eventData.date),
    endDate: eventData.endDate ? new Date(eventData.endDate) : undefined,
    venue: typeof eventData.venue === 'object' && eventData.venue
      ? { id: (eventData.venue as any).id ?? '', name: (eventData.venue as any).name ?? '', address: (eventData.venue as any).address ?? '', city: (eventData.venue as any).city ?? '', capacity: (eventData.venue as any).capacity ?? 0 }
      : { id: '', name: '', address: '', city: '', capacity: 0 },
    promoter: typeof eventData.promoter === 'object' && eventData.promoter
      ? { id: (eventData.promoter as any).id ?? '', name: (eventData.promoter as any).name ?? '', image: (eventData.promoter as any).image ?? '', description: (eventData.promoter as any).description ?? '', verified: !!(eventData.promoter as any).verified, followersCount: (eventData.promoter as any).followersCount ?? 0 }
      : { id: '', name: '', image: '', description: '', verified: false, followersCount: 0 },
    ticketTypes: Array.isArray(eventData.ticketTypes) ? eventData.ticketTypes : [],
    artists: Array.isArray(eventData.artists) ? eventData.artists : [],
    isSoldOut: (eventData as any).isSoldOut ?? false,
    duration: (eventData as any).duration,
    socialLinks: (eventData as any).socialLinks,
  } : null;
  
  const eventId = event?.id;

  // Detect if this event is at a venue with a numbered seat map (e.g. Teatro Baltazar Dias)
  const hasSeatMap = useMemo(
    () => !!event && isBaltazarDiasVenue(event.venue.name),
    [event]
  );

  // Load seat states from Supabase for seat-map venues
  const { data: eventSeatsData } = api.seats.listEventSeats.useQuery(
    { eventId: eventId || '' },
    { enabled: !!eventId && hasSeatMap, staleTime: 15000 }
  );

  const ensureSeatsMutation = api.seats.ensureEventSeats.useMutation();
  const reserveSeatsMutation = api.seats.reserveSeats.useMutation();

  const seatStates = useMemo<Record<string, 'available' | 'selected' | 'booked' | 'reserved' | 'blocked'>>(() => {
    const map: Record<string, any> = {};
    if (eventSeatsData && Array.isArray(eventSeatsData)) {
      for (const row of eventSeatsData) {
        if (row.seat_label && row.status) {
          map[row.seat_label] = row.status;
        }
      }
    }
    return map;
  }, [eventSeatsData]);

  useEffect(() => {
    if (eventId && hasSeatMap && event) {
      ensureSeatsMutation.mutateAsync({ eventId, venueName: event.venue.name }).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ['seats', 'listEventSeats'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, hasSeatMap]);

  useEffect(() => {
    if (eventId) {
      setIsLiked(isFavorite(eventId));
    }
  }, [eventId, isFavorite]);

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LoadingSpinner message="A carregar evento..." />
      </View>
    );
  }

  // Error state
  if (error || !event) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ErrorState
          message={error ? handleError(error) : 'Evento não encontrado'}
          onRetry={error ? () => refetch() : undefined}
        />
      </View>
    );
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleTicketChange = (ticketId: string, change: number) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    setSelectedTickets(prev => {
      const current = prev[ticketId] || 0;
      const ticketType = event.ticketTypes.find(t => t.id === ticketId);
      const newValue = Math.max(0, Math.min(current + change, ticketType?.maxPerPerson || 0));
      
      if (newValue === 0) {
        const { [ticketId]: _, ...rest } = prev;
        return rest;
      }
      
      return { ...prev, [ticketId]: newValue };
    });
  };

  const getTotalPrice = () => {
    return Object.entries(selectedTickets).reduce((total, [ticketId, quantity]) => {
      const ticket = event.ticketTypes.find(t => t.id === ticketId);
      return total + (ticket?.price || 0) * quantity;
    }, 0);
  };

  const getTotalTickets = () => {
    return Object.values(selectedTickets).reduce((total, quantity) => total + quantity, 0);
  };

  const handleAddToCart = () => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    // For seat-map venues: add a single cart item per selected seat group
    if (hasSeatMap) {
      if (selectedSeats.length === 0) {
        Alert.alert('Seleção de lugares', 'Por favor, selecione pelo menos um lugar no mapa da plateia.');
        return;
      }
      // Use the first (or only) ticket type as the price reference.
      // For Baltazar Dias we treat all selected seats as Plateia tier unless
      // ticket types explicitly model sections.
      const ticket = event.ticketTypes[0];
      if (ticket) {
        addToCart({
          eventId: event.id,
          ticketTypeId: ticket.id,
          quantity: selectedSeats.length,
          price: ticket.price,
          eventTitle: event.title,
          eventImage: event.image,
          ticketTypeName: ticket.name,
          seatLabels: selectedSeats,
          venueName: event.venue.name,
        });
      }
      // Release previous reservation and reserve the new selection
      if (user) {
        reserveSeatsMutation.mutateAsync({
          eventId: event.id,
          seatLabels: selectedSeats,
          userId: user.id,
          minutes: 10,
        }).catch(() => {});
      }
      setSelectedSeats([]);
      setSeatMapVisible(false);
      router.push('/(tabs)/tickets?tab=cart');
      return;
    }

    Object.entries(selectedTickets).forEach(([ticketId, quantity]) => {
      const ticket = event.ticketTypes.find(t => t.id === ticketId);
      if (ticket) {
        addToCart({
          eventId: event.id,
          ticketTypeId: ticketId,
          quantity,
          price: ticket.price,
          eventTitle: event.title,
          eventImage: event.image,
          ticketTypeName: ticket.name,
          venueName: event.venue.name,
        });
      }
    });
    
    setSelectedTickets({});
    router.push('/(tabs)/tickets?tab=cart');
  };

  const toggleLike = async () => {
    if (!event) return;
    
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    if (isLiked) {
      await removeFromFavorites(event.id);
    } else {
      await addToFavorites(event.id);
    }
    setIsLiked(!isLiked);
  };
  
  const handleShare = async () => {
    if (!event) return;
    
    const minPrice = Math.min(...event.ticketTypes.map(t => t.price));
    const shareParams = {
      eventId: event.id,
      eventTitle: event.title,
      eventDescription: event.description,
      eventImage: event.image,
      eventDate: event.date,
      eventVenue: `${event.venue.name}, ${event.venue.city}`,
      eventPrice: minPrice,
      imageUri: event.image,
    };
    
    const shareOptions = [
      'WhatsApp',
      'Facebook', 
      'Instagram',
      'Twitter',
      'Outro',
      'Copiar Link',
      'Cancelar'
    ];
    
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: shareOptions,
          cancelButtonIndex: shareOptions.length - 1,
          title: 'Partilhar Evento'
        },
        (buttonIndex) => {
          if (buttonIndex === shareOptions.length - 1) return;
          
          if (buttonIndex === 4) {
            void shareEventWithImage(shareParams);
            return;
          }
          
          const platforms: ('whatsapp' | 'facebook' | 'instagram' | 'twitter' | 'copy')[] = [
            'whatsapp', 'facebook', 'instagram', 'twitter', 'copy'
          ];
          
          void shareEventUtil({
            ...shareParams,
            platform: platforms[buttonIndex]
          });
        }
      );
    } else if (Platform.OS === 'android') {
      Alert.alert(
        'Partilhar Evento',
        'Escolhe onde queres partilhar:',
        [
          {
            text: 'WhatsApp',
            onPress: () => void shareEventUtil({ ...shareParams, platform: 'whatsapp' })
          },
          {
            text: 'Facebook',
            onPress: () => void shareEventUtil({ ...shareParams, platform: 'facebook' })
          },
          {
            text: 'Instagram',
            onPress: () => void shareEventUtil({ ...shareParams, platform: 'instagram' })
          },
          {
            text: 'Twitter/X',
            onPress: () => void shareEventUtil({ ...shareParams, platform: 'twitter' })
          },
          {
            text: 'Outro',
            onPress: () => void shareEventWithImage(shareParams)
          },
          {
            text: 'Copiar Link',
            onPress: () => void shareEventUtil({ ...shareParams, platform: 'copy' })
          },
          {
            text: 'Cancelar',
            style: 'cancel'
          }
        ]
      );
    } else {
      await shareEventWithImage(shareParams);
    }
  };
  
  const handleAddToCalendar = async () => {
    if (!event) return;
    
    const success = await addToCalendar(
      event.id, 
      event.title, 
      event.date, 
      `${event.venue.name}, ${event.venue.city}`
    );
    
    if (success) {
      Alert.alert('Sucesso', 'Evento adicionado ao calendário!');
    } else {
      Alert.alert('Erro', 'Não foi possível adicionar ao calendário');
    }
  };
  
  const handleSetReminder = async () => {
    if (!event) return;
    
    const reminderOptions = [
      '1 hora antes',
      '3 horas antes',
      '1 dia antes',
      '3 dias antes',
      '1 semana antes',
      'Cancelar'
    ];
    
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: reminderOptions,
          cancelButtonIndex: reminderOptions.length - 1,
          title: 'Quando deseja ser lembrado?'
        },
        async (buttonIndex) => {
          if (buttonIndex === reminderOptions.length - 1) return;
          
          const success = await setReminder(event.id, event.date);
          
          if (success) {
            Alert.alert('Lembrete Definido', `Receberás uma notificação ${reminderOptions[buttonIndex]} do evento!`);
          } else {
            Alert.alert('Erro', 'Não foi possível definir o lembrete');
          }
        }
      );
    } else {
      Alert.alert(
        'Quando deseja ser lembrado?',
        '',
        reminderOptions.slice(0, -1).map((option, _index) => ({
          text: option,
          onPress: async () => {
            const success = await setReminder(event.id, event.date);
            
            if (success) {
              Alert.alert('Lembrete Definido', `Receberás uma notificação ${option} do evento!`);
            } else {
              Alert.alert('Erro', 'Não foi possível definir o lembrete');
            }
          }
        }))
      );
    }
  };
  

  
  const handleInviteFriends = () => {
    Alert.alert(
      'Convidar Amigos',
      'Esta funcionalidade estará disponível em breve!',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <Image source={{ uri: event.image }} style={styles.heroImage} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.heroGradient}
          />
          
          {/* Header Actions */}
          <SafeAreaView style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => router.back()}
            >
              <ChevronLeft size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerRight}>
              <TouchableOpacity 
                style={styles.headerButton}
                onPress={handleShare}
              >
                <Share2 size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.headerButton}
                onPress={toggleLike}
              >
                <Heart size={20} color="#fff" fill={isLiked ? '#FF385C' : 'transparent'} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          
          {/* Title and Date Overlay */}
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>{event.title}</Text>
            <View style={styles.heroDateRow}>
              <Calendar size={16} color="#fff" />
              <Text style={styles.heroDate}>{formatDate(event.date)}</Text>
            </View>
          </View>
        </View>

        {/* Content */}
        <View style={[styles.content, { backgroundColor: colors.background }]}>
          {/* Social Proof */}
          {typeof id === 'string' && <SocialProof eventId={id} />}

          {/* FOMO Alert */}
          {!event.isSoldOut && <FOMOAlert ticketTypes={event.ticketTypes} />}
          {event.isSoldOut && (
            <View style={styles.titleSection}>
              <View style={[styles.soldOutBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.soldOutText}>ESGOTADO</Text>
              </View>
            </View>
          )}

          {/* Artists */}
          {event.artists.length > 1 && (
            <View style={styles.artistsSection}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Artistas</Text>
              {event.artists.map(artist => (
                <View key={artist.id} style={styles.artistItem}>
                  <Text style={[styles.artistName, { color: colors.text }]}>{artist.name}</Text>
                  <Text style={[styles.artistGenre, { color: colors.textSecondary }]}>{artist.genre}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Event Info */}
          <View style={[styles.infoSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoItem}>
              <MapPin size={20} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Local</Text>
                <Text style={[styles.infoText, { color: colors.text }]}>{event.venue.name}</Text>
                <Text style={[styles.infoSubtext, { color: colors.textSecondary }]}>{event.venue.address}, {event.venue.city}</Text>
              </View>
            </View>
            

          </View>

          {/* Quick Actions */}
          <View style={styles.quickActionsSection}>
            <TouchableOpacity 
              style={[
                styles.quickActionButton,
                { backgroundColor: colors.background, borderColor: colors.primary },
                isEventInCalendar(event.id) && { ...styles.quickActionButtonActive, backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
              onPress={handleAddToCalendar}
            >
              <Calendar size={20} color={isEventInCalendar(event.id) ? "#fff" : colors.primary} />
              <Text style={[
                styles.quickActionText,
                { color: isEventInCalendar(event.id) ? "#fff" : colors.primary },
                isEventInCalendar(event.id) && styles.quickActionTextActive
              ]}>
                {isEventInCalendar(event.id) ? 'No Calendário' : 'Adicionar ao Calendário'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.quickActionButton,
                { backgroundColor: colors.background, borderColor: colors.primary },
                hasReminder(event.id) && { ...styles.quickActionButtonActive, backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
              onPress={handleSetReminder}
            >
              <Bell size={20} color={hasReminder(event.id) ? "#fff" : colors.primary} />
              <Text style={[
                styles.quickActionText,
                { color: hasReminder(event.id) ? "#fff" : colors.primary },
                hasReminder(event.id) && styles.quickActionTextActive
              ]}>
                {hasReminder(event.id) ? 'Lembrete Ativo' : 'Definir Lembrete'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Social Actions */}
          <View style={styles.socialActionsSection}>
            <TouchableOpacity 
              style={[styles.socialActionButton, { backgroundColor: colors.background, borderColor: colors.primary }]}
              onPress={handleInviteFriends}
            >
              <UserPlus size={20} color={colors.primary} />
              <Text style={[styles.socialActionText, { color: colors.primary }]}>Convidar Amigos</Text>
            </TouchableOpacity>
          </View>
          
          {/* Event Details */}
          {event.duration && (
            <View style={styles.detailsSection}>
              <View style={styles.detailItem}>
                <Clock size={16} color={colors.textSecondary} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>Duração: {event.duration} minutos</Text>
              </View>
            </View>
          )}
          
          {/* Promoter Info */}
          <View style={styles.promoterSection}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Organizado por</Text>
            <TouchableOpacity 
              style={[styles.promoterCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/promoter/${event.promoter.id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.promoterInfo}>
                <View style={styles.promoterHeader}>
                  <Text style={[styles.promoterName, { color: colors.primary }]}>{event.promoter.name}</Text>
                  {event.promoter.verified && (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.promoterDescription, { color: colors.textSecondary }]}>{event.promoter.description}</Text>
              </View>
            </TouchableOpacity>
          </View>
          
          {/* Social Links */}
          {event.socialLinks && (
            <View style={styles.socialSection}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Redes Sociais</Text>
              <View style={styles.socialLinks}>
                {event.socialLinks.instagram && (
                  <TouchableOpacity style={[styles.socialButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Instagram size={20} color="#E4405F" />
                    <Text style={[styles.socialButtonText, { color: colors.primary }]}>Instagram</Text>
                  </TouchableOpacity>
                )}
                {event.socialLinks.facebook && (
                  <TouchableOpacity style={[styles.socialButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Facebook size={20} color="#1877F2" />
                    <Text style={[styles.socialButtonText, { color: colors.primary }]}>Facebook</Text>
                  </TouchableOpacity>
                )}
                {event.socialLinks.website && (
                  <TouchableOpacity style={[styles.socialButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Globe size={20} color={colors.textSecondary} />
                    <Text style={[styles.socialButtonText, { color: colors.primary }]}>Website</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          
          {/* Description */}
          <View style={styles.descriptionSection}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>Sobre o Evento</Text>
            <Text style={[styles.description, { color: colors.text }]}>{event.description}</Text>
          </View>

          {/* Tickets */}
          {!event.isSoldOut && (
            <View style={styles.ticketsSection}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Ingressos</Text>

              {/* Seat selection for venues with numbered seats */}
              {hasSeatMap && (
                <View style={[styles.seatMapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.seatMapHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.seatMapTitle, { color: colors.text }]}>
                        Seleção de Lugares
                      </Text>
                      <Text style={[styles.seatMapSubtitle, { color: colors.textSecondary }]}>
                        {event.venue.name} — Plateia numerada
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.seatMapToggle, { backgroundColor: colors.primary }]}
                      onPress={() => setSeatMapVisible((v) => !v)}
                    >
                      <Text style={styles.seatMapToggleText}>
                        {seatMapVisible ? 'Fechar mapa' : 'Abrir mapa'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {seatMapVisible && (
                    <SeatMap
                      map={BALTAZAR_DIAS_SEAT_MAP}
                      seatStates={seatStates}
                      selectedSeats={selectedSeats}
                      onToggleSeat={(label) => {
                        setSelectedSeats((prev) =>
                          prev.includes(label)
                            ? prev.filter((l) => l !== label)
                            : [...prev, label]
                        );
                      }}
                      maxSelectable={Math.min(
                        6,
                        event.ticketTypes[0]?.maxPerPerson ?? 6
                      )}
                      onMaxExceeded={() =>
                        Alert.alert(
                          'Limite de lugares',
                          'Só pode selecionar até ' +
                            (Math.min(6, event.ticketTypes[0]?.maxPerPerson ?? 6)) +
                            ' lugares por compra.'
                        )
                      }
                    />
                  )}
                </View>
              )}

              {/* Standard ticket types (shown for non-seat-map venues, or as info for seat-map venues) */}
              {!hasSeatMap && event.ticketTypes.map(ticket => (
                <View key={ticket.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.ticketInfo}>
                    <Text style={[styles.ticketName, { color: colors.primary }]}>{ticket.name}</Text>
                    {ticket.description && (
                      <Text style={[styles.ticketDescription, { color: colors.textSecondary }]}>{ticket.description}</Text>
                    )}
                    <Text style={[styles.ticketPrice, { color: colors.primary }]}>€{ticket.price}</Text>
                    {ticket.available < 50 && (
                      <Text style={styles.ticketAvailable}>
                        Apenas {ticket.available} disponíveis
                      </Text>
                    )}
                  </View>
                  
                  <View style={styles.ticketActions}>
                    {ticket.available === 0 ? (
                      <Text style={[styles.soldOutTicket, { color: colors.primary }]}>Esgotado</Text>
                    ) : (
                      <>
                        <View style={[styles.quantitySelector, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <TouchableOpacity 
                            style={[styles.quantityButton, { backgroundColor: colors.primary }]}
                            onPress={() => handleTicketChange(ticket.id, -1)}
                            disabled={!selectedTickets[ticket.id]}
                          >
                            <Text style={styles.quantityButtonText}>−</Text>
                          </TouchableOpacity>
                          <Text style={[styles.quantityText, { color: colors.primary }]}>
                            {selectedTickets[ticket.id] || 0}
                          </Text>
                          <TouchableOpacity 
                            style={[styles.quantityButton, { backgroundColor: colors.primary }]}
                            onPress={() => handleTicketChange(ticket.id, 1)}
                            disabled={selectedTickets[ticket.id] >= ticket.maxPerPerson}
                          >
                            <Text style={styles.quantityButtonText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              ))}

              {/* Price reference for seat-map venues */}
              {hasSeatMap && event.ticketTypes[0] && (
                <View style={[styles.seatPriceInfo, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.seatPriceLabel, { color: colors.textSecondary }]}>
                    Preço por lugar
                  </Text>
                  <Text style={[styles.seatPriceValue, { color: colors.primary }]}>
                    €{event.ticketTypes[0].price.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer */}
      {(hasSeatMap ? selectedSeats.length > 0 : getTotalTickets() > 0) && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <View style={styles.footerInfo}>
            <Text style={[styles.footerTickets, { color: colors.textSecondary }]}>
              {hasSeatMap
                ? `${selectedSeats.length} lugar(es)`
                : `${getTotalTickets()} ingresso(s)`}
            </Text>
            <Text style={[styles.footerPrice, { color: colors.primary }]}>
              €{(hasSeatMap
                ? selectedSeats.length * (event.ticketTypes[0]?.price ?? 0)
                : getTotalPrice()
              ).toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.addToCartButton, { backgroundColor: colors.primary }]}
            onPress={handleAddToCart}
          >
            <Text style={styles.addToCartText}>Adicionar ao Carrinho</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
  heroContainer: {
    height: hp(40),
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: responsiveSpacing(20),
    left: responsiveSpacing(20),
    right: responsiveSpacing(20),
  },
  heroTitle: {
    fontSize: responsiveFontSize(28),
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: responsiveSpacing(8),
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroDate: {
    fontSize: responsiveFontSize(14),
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerActions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 0,
  },
  headerButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  content: {
    padding: responsiveSpacing(20),
    backgroundColor: '#FFFFFF',
  },
  titleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: '#0099a8',
    flex: 1,
  },
  soldOutBadge: {
    backgroundColor: '#0099a8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  soldOutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold' as const,
  },
  artistsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: responsiveFontSize(18),
    fontWeight: 'bold' as const,
    color: '#0099a8',
    marginBottom: responsiveSpacing(12),
  },
  artistItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  artistName: {
    fontSize: 16,
    color: '#333',
  },
  artistGenre: {
    fontSize: 14,
    color: '#666',
  },
  infoSection: {
    backgroundColor: '#F0F9FA',
    borderRadius: moderateScale(16),
    padding: responsiveSpacing(16),
    marginBottom: responsiveSpacing(24),
    gap: responsiveSpacing(16),
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  infoItem: {
    flexDirection: 'row',
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600' as const,
  },
  infoSubtext: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  quickActionsSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  socialActionsSection: {
    marginBottom: 24,
  },
  socialActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#0099a8',
    marginBottom: 12,
  },
  socialActionText: {
    fontSize: 14,
    color: '#0099a8',
    fontWeight: '600' as const,
  },

  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#0099a8',
  },
  quickActionButtonActive: {
    backgroundColor: '#0099a8',
    borderColor: '#0099a8',
  },
  quickActionText: {
    fontSize: 14,
    color: '#0099a8',
    fontWeight: '600' as const,
  },
  quickActionTextActive: {
    color: '#fff',
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#999',
  },
  promoterSection: {
    marginBottom: 24,
  },
  promoterCard: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FA',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  promoterImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  promoterInfo: {
    flex: 1,
  },
  promoterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  promoterName: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#0099a8',
  },
  verifiedBadge: {
    backgroundColor: '#1DA1F2',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold' as const,
  },
  promoterDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  promoterFollowers: {
    fontSize: 12,
    color: '#666',
  },
  socialSection: {
    marginBottom: 24,
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FA',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  socialButtonText: {
    fontSize: 14,
    color: '#0099a8',
  },
  descriptionSection: {
    marginBottom: 24,
  },
  description: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  ticketsSection: {
    marginBottom: 100,
  },
  seatMapCard: {
    borderRadius: moderateScale(12),
    padding: responsiveSpacing(16),
    marginBottom: responsiveSpacing(12),
    borderWidth: 1,
  },
  seatMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  seatMapTitle: {
    fontSize: responsiveFontSize(16),
    fontWeight: 'bold' as const,
  },
  seatMapSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  seatMapToggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  seatMapToggleText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  seatPriceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: responsiveSpacing(16),
    paddingVertical: responsiveSpacing(12),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    marginTop: 8,
  },
  seatPriceLabel: {
    fontSize: 14,
  },
  seatPriceValue: {
    fontSize: 20,
    fontWeight: 'bold' as const,
  },
  ticketCard: {
    backgroundColor: '#F0F9FA',
    borderRadius: moderateScale(12),
    padding: responsiveSpacing(16),
    marginBottom: responsiveSpacing(12),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  ticketInfo: {
    flex: 1,
  },
  ticketName: {
    fontSize: responsiveFontSize(16),
    fontWeight: 'bold' as const,
    color: '#0099a8',
  },
  ticketDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  ticketPrice: {
    fontSize: responsiveFontSize(20),
    fontWeight: 'bold' as const,
    color: '#0099a8',
    marginTop: responsiveSpacing(8),
  },
  ticketAvailable: {
    fontSize: 12,
    color: '#FFA500',
    marginTop: 4,
  },
  ticketActions: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  oneClickButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oneClickButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  soldOutTicket: {
    color: '#0099a8',
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  quantityButton: {
    width: moderateScale(32),
    height: moderateScale(32),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0099a8',
    borderRadius: moderateScale(6),
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold' as const,
  },
  quantityText: {
    color: '#0099a8',
    fontSize: 16,
    fontWeight: 'bold' as const,
    marginHorizontal: 16,
    minWidth: 20,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 30 : 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  footerInfo: {
    flex: 1,
  },
  footerTickets: {
    fontSize: 14,
    color: '#666',
  },
  footerPrice: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#0099a8',
  },
  addToCartButton: {
    backgroundColor: '#0099a8',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 9999,
  },
  addToCartText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
});
