import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { 
  Calendar, 
  Search, 
  Filter,
  MapPin,
  DollarSign,
  CheckCircle,
  XCircle,
  User,
  LogOut,
  Plus,
  X,
  ChevronDown,
  Eye,
  Users,
  Ticket,
  Star,
  ChevronRight,
  Trash2,
  Ban,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/colors';
import { useUser } from '@/hooks/user-context';
import { api } from '@/lib/api';
import { apiClient } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { uploadImageToBucket } from '@/utils/supabase-upload';
import DatePicker from '@/components/DatePicker';
import TimePicker from '@/components/TimePicker';

const CATEGORY_MAP: { label: string; value: string }[] = [
  { label: 'Música', value: 'music' },
  { label: 'Festival', value: 'festival' },
  { label: 'Teatro', value: 'theater' },
  { label: 'Comédia', value: 'comedy' },
  { label: 'Desporto', value: 'sports' },
  { label: 'Conferência', value: 'conference' },
  { label: 'Dança', value: 'dance' },
  { label: 'Arte', value: 'art' },
  { label: 'Outro', value: 'other' },
];

const TICKET_STAGES = [
  'Early Bird', 'Normal', 'VIP', 'Premium', 'Gold', 'Silver', 'Bronze', 'Mesa', 'Pista', 'Camarote', 'Balcão', 'Geral',
];

export default function AdminEvents() {
  const { logout } = useUser();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'pending' | 'cancelled'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPromoterPicker, setShowPromoterPicker] = useState(false);

  const { data: rawEvents = [], isLoading: eventsLoading, refetch: refetchEvents } = api.events.list.useQuery();
  const { data: promotersList = [], isLoading: promotersLoading } = api.promoters.list.useQuery();

  const approveMutation = api.events.approve.useMutation({
    onSuccess: () => {
      void refetchEvents();
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
  const rejectMutation = api.events.reject.useMutation({
    onSuccess: () => {
      void refetchEvents();
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
  const cancelMutation = api.events.cancel.useMutation({
    onSuccess: () => {
      void refetchEvents();
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
  const deleteMutation = api.events.delete.useMutation({
    onSuccess: () => {
      void refetchEvents();
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const [isUploadingImage, setIsUploadingImage] = useState(false);

  interface AdminTicketType {
    id: string;
    name: string;
    stage: string;
    price: string;
    quantity: string;
    description: string;
  }

  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    category: '',
    venueName: '',
    venueAddress: '',
    venueCity: '',
    eventDate: new Date(),
    eventTime: new Date(),
    image: '',
    promoterId: '',
    promoterName: '',
  });

  const [ticketTypes, setTicketTypes] = useState<AdminTicketType[]>([
    { id: '1', name: 'Bilhete Normal', stage: '', price: '', quantity: '', description: '' },
  ]);
  const [showStagePicker, setShowStagePicker] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const addTicketType = () => {
    const newId = (ticketTypes.length + 1).toString();
    setTicketTypes(prev => [...prev, { id: newId, name: '', stage: '', price: '', quantity: '', description: '' }]);
  };

  const removeTicketType = (id: string) => {
    if (ticketTypes.length === 1) {
      Alert.alert('Erro', 'Deve ter pelo menos um tipo de bilhete.');
      return;
    }
    setTicketTypes(prev => prev.filter(t => t.id !== id));
  };

  const updateTicketType = (id: string, field: keyof AdminTicketType, value: string) => {
    setTicketTypes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const events = useMemo(() => (rawEvents || []).map((e: any) => {
    const dateVal = e.date instanceof Date ? e.date : new Date(e.date);
    return {
      id: e.id,
      title: e.title || '',
      description: e.description || '',
      date: dateVal.toISOString().split('T')[0],
      time: dateVal.toTimeString().substring(0, 5),
      location: e.venue?.city || '',
      venue: e.venue?.name || '',
      category: e.category || 'other',
      promoterId: e.promoter?.id || '',
      promoterName: e.promoter?.name || 'Desconhecido',
      imageUrl: e.image || '',
      price: (e.ticketTypes && e.ticketTypes[0]?.price) || 0,
      totalTickets: (e.ticketTypes || []).reduce((sum: number, t: any) => sum + (t.available || 0), 0),
      soldTickets: 0,
      status: e.isSoldOut ? 'completed' : (e as any).status || 'published',
      isVerified: e.promoter?.verified || false,
      revenue: 0,
    };
  }), [rawEvents]);

  const filteredEvents = useMemo(() => events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.promoterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || event.status === filterStatus;
    return matchesSearch && matchesFilter;
  }), [events, searchQuery, filterStatus]);

  const getCategoryLabel = (cat: string) => {
    return CATEGORY_MAP.find(c => c.value === cat)?.label ?? (cat || 'Outro');
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'published': return 'Publicado';
      case 'pending': return 'Pendente';
      case 'cancelled': return 'Cancelado';
      case 'completed': return 'Esgotado';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return COLORS.success;
      case 'pending': return COLORS.warning;
      case 'cancelled': return COLORS.error;
      case 'completed': return COLORS.info;
      default: return COLORS.gray;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pt-PT');
    } catch {
      return dateString;
    }
  };

  const handleLogout = () => {
    Alert.alert('Terminar Sessão', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Terminar', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } }
    ]);
  };

  const handleEventAction = useCallback((eventId: string, action: 'approve' | 'reject' | 'cancel' | 'delete') => {
    const labels: Record<string, string> = { approve: 'Aprovar', reject: 'Rejeitar', cancel: 'Cancelar', delete: 'Eliminar' };
    const messages: Record<string, string> = {
      approve: 'Tem certeza que quer aprovar este evento?',
      reject: 'Tem certeza que quer rejeitar este evento?',
      cancel: 'Tem certeza que quer cancelar este evento? Os utilizadores não poderão comprar mais bilhetes.',
      delete: 'ATENÇÃO: Esta ação elimina permanentemente o evento e todos os bilhetes associados. Não pode ser desfeita. Tem certeza?',
    };
    Alert.alert(labels[action], messages[action], [
      { text: 'Não', style: 'cancel' },
      {
        text: action === 'delete' ? 'Eliminar' : 'Sim',
        style: action === 'delete' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            if (action === 'approve') {
              await approveMutation.mutateAsync({ eventId });
            } else if (action === 'reject') {
              await rejectMutation.mutateAsync({ eventId });
            } else if (action === 'cancel') {
              await cancelMutation.mutateAsync({ eventId });
            } else if (action === 'delete') {
              await deleteMutation.mutateAsync({ id: eventId });
            }
            Alert.alert('Sucesso', 'Ação realizada com sucesso!');
          } catch (error) {
            console.error('Erro na ação:', error);
            const errMsg = error instanceof Error ? error.message : 'Falha ao executar ação.';
            Alert.alert('Erro', errMsg);
          }
        }
      }
    ]);
  }, [approveMutation, rejectMutation, cancelMutation, deleteMutation]);

  const handlePickEventImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão Necessária', 'Precisamos de acesso à galeria.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setIsUploadingImage(true);
        try {
          const publicUrl = await uploadImageToBucket('events', result.assets[0].uri, 'event');
          setNewEvent(p => ({ ...p, image: publicUrl }));
        } catch (uploadErr: any) {
          console.error('Upload failed:', uploadErr);
          setNewEvent(p => ({ ...p, image: result.assets[0]!.uri }));
          Alert.alert('Aviso', 'Upload falhou. Imagem local será usada.');
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Erro ao selecionar imagem:', error);
      Alert.alert('Erro', 'Falha ao selecionar imagem.');
    }
  }, []);

  const handleCreateEvent = useCallback(async () => {
    if (!newEvent.title.trim()) { Alert.alert('Erro', 'Preencha o título.'); return; }
    if (!newEvent.venueName.trim()) { Alert.alert('Erro', 'Preencha o local.'); return; }
    if (!newEvent.venueAddress.trim()) { Alert.alert('Erro', 'Preencha o endereço.'); return; }
    if (!newEvent.category) { Alert.alert('Erro', 'Selecione uma categoria.'); return; }
    if (!newEvent.promoterId) { Alert.alert('Erro', 'Selecione um promotor.'); return; }

    const validTickets = ticketTypes.filter(t => t.name && t.stage && t.price && t.quantity);
    if (validTickets.length === 0) {
      Alert.alert('Erro', 'Preencha pelo menos um bilhete completamente (nome, stage, preço e quantidade).');
      return;
    }

    try {
      console.log('📤 Admin criando evento...');
      const hours = newEvent.eventTime.getHours().toString().padStart(2, '0');
      const minutes = newEvent.eventTime.getMinutes().toString().padStart(2, '0');
      const dateStr = newEvent.eventDate.toISOString().split('T')[0];

      const eventPayload = {
        title: newEvent.title.trim(),
        description: newEvent.description.trim(),
        category: newEvent.category,
        venueName: newEvent.venueName.trim(),
        venueAddress: newEvent.venueAddress.trim(),
        venueCity: newEvent.venueCity.trim(),
        date: `${dateStr}T${hours}:${minutes}:00`,
        image: newEvent.image.trim(),
        promoterId: newEvent.promoterId,
        status: 'published',
        ticketTypes: validTickets.map(t => ({
          name: t.name,
          stage: t.stage,
          price: parseFloat(t.price) || 0,
          available: parseInt(t.quantity) || 0,
          description: t.description || '',
        })),
      };

      console.log('📦 Payload:', JSON.stringify(eventPayload));
      await apiClient.events.create.mutate(eventPayload);
      console.log('✅ Evento criado pelo admin');

      setShowCreateModal(false);
      setNewEvent({
        title: '', description: '', category: '', venueName: '', venueAddress: '',
        venueCity: '', eventDate: new Date(), eventTime: new Date(), image: '', promoterId: '', promoterName: '',
      });
      setTicketTypes([{ id: '1', name: 'Bilhete Normal', stage: '', price: '', quantity: '', description: '' }]);
      setShowStagePicker(null);
      void refetchEvents();
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      Alert.alert('Sucesso', 'Evento criado e publicado com sucesso!');
    } catch (error: any) {
      console.error('❌ Erro ao criar evento:', error);
      const msg = error?.message || 'Falha ao criar evento. Tente novamente.';
      Alert.alert('Erro', msg);
    }
  }, [newEvent, ticketTypes, refetchEvents, queryClient]);

  const totalEvents = events.length;
  const publishedEvents = events.filter(e => e.status === 'published').length;
  const pendingEvents = events.filter(e => e.status === 'pending').length;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Gerir Eventos',
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: COLORS.white,
          headerTitleStyle: { fontWeight: 'bold' as const },
          headerRight: () => (
            <TouchableOpacity style={styles.profileButton} onPress={handleLogout}>
              <User size={20} color={COLORS.white} />
              <LogOut size={16} color={COLORS.white} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetchEvents()} />}
      >
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)}>
          <Plus size={20} color={COLORS.white} />
          <Text style={styles.createButtonText}>Criar Evento</Text>
        </TouchableOpacity>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Search size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Procurar eventos..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(!showFilters)}>
            <Filter size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filterOptions}>
            {(['all', 'published', 'pending', 'cancelled'] as const).map(status => (
              <TouchableOpacity
                key={status}
                style={[styles.filterOption, filterStatus === status && styles.filterOptionActive]}
                onPress={() => setFilterStatus(status)}
              >
                <Text style={[styles.filterOptionText, filterStatus === status && styles.filterOptionTextActive]}>
                  {status === 'all' ? 'Todos' : getStatusLabel(status)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{totalEvents}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{publishedEvents}</Text>
            <Text style={styles.statLabel}>Publicados</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.warning }]}>{pendingEvents}</Text>
            <Text style={styles.statLabel}>Pendentes</Text>
          </View>
        </View>

        {eventsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>A carregar eventos...</Text>
          </View>
        ) : (
          <>
            {filteredEvents.map(event => (
              <TouchableOpacity
                key={event.id}
                style={styles.eventCard}
                activeOpacity={0.7}
                onPress={() => { setSelectedEvent(event); setShowDetailModal(true); }}
              >
                <View style={styles.eventHeader}>
                  {event.imageUrl ? (
                    <Image source={{ uri: event.imageUrl }} style={styles.eventImage} />
                  ) : (
                    <View style={[styles.eventImage, { backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center' }]}>
                      <Calendar size={24} color={COLORS.textSecondary} />
                    </View>
                  )}
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                    <Text style={styles.eventPromoter}>por {event.promoterName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(event.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(event.status) }]}>
                        {getStatusLabel(event.status)}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color={COLORS.textSecondary} />
                </View>

                <View style={styles.eventDetails}>
                  <View style={styles.detailRow}>
                    <Calendar size={14} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{formatDate(event.date)} às {event.time || '00:00'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <MapPin size={14} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{event.venue}{event.location ? `, ${event.location}` : ''}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <DollarSign size={14} color={COLORS.textSecondary} />
                    <Text style={styles.detailText}>{`€${event.price}`} {getCategoryLabel(event.category)}</Text>
                  </View>
                </View>

                {event.status === 'pending' && (
                  <View style={styles.eventActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: COLORS.error }]}
                      onPress={(e) => { e.stopPropagation(); handleEventAction(event.id, 'reject'); }}
                    >
                      <XCircle size={16} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: COLORS.success }]}
                      onPress={(e) => { e.stopPropagation(); handleEventAction(event.id, 'approve'); }}
                    >
                      <CheckCircle size={16} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {event.status === 'published' && (
                  <View style={styles.eventActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: COLORS.warning }]}
                      onPress={(e) => { e.stopPropagation(); handleEventAction(event.id, 'cancel'); }}
                    >
                      <Ban size={16} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: COLORS.error }]}
                      onPress={(e) => { e.stopPropagation(); handleEventAction(event.id, 'delete'); }}
                    >
                      <Trash2 size={16} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {event.status === 'cancelled' && (
                  <View style={styles.eventActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: COLORS.error }]}
                      onPress={(e) => { e.stopPropagation(); handleEventAction(event.id, 'delete'); }}
                    >
                      <Trash2 size={16} color={COLORS.white} />
                      <Text style={styles.actionButtonText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            {filteredEvents.length === 0 && !eventsLoading && (
              <View style={styles.emptyState}>
                <Calendar size={48} color={COLORS.lightGray} />
                <Text style={styles.emptyStateText}>Nenhum evento encontrado</Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Criar Evento</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Título *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nome do evento"
              value={newEvent.title}
              onChangeText={(v) => setNewEvent(p => ({ ...p, title: v }))}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.fieldLabel}>Descrição</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Descrição do evento"
              value={newEvent.description}
              onChangeText={(v) => setNewEvent(p => ({ ...p, description: v }))}
              multiline
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.fieldLabel}>Categoria *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORY_MAP.map(cat => (
                <TouchableOpacity
                  key={cat.value}
                  style={[styles.categoryChip, newEvent.category === cat.value && styles.categoryChipActive]}
                  onPress={() => setNewEvent(p => ({ ...p, category: cat.value }))}
                >
                  <Text style={[styles.categoryChipText, newEvent.category === cat.value && styles.categoryChipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Promotor *</Text>
            <TouchableOpacity
              style={styles.promoterSelector}
              onPress={() => setShowPromoterPicker(!showPromoterPicker)}
            >
              <Text style={[styles.promoterSelectorText, !newEvent.promoterName && { color: COLORS.textSecondary }]}>
                {newEvent.promoterName || 'Selecionar promotor'}
              </Text>
              <ChevronDown size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>

            {showPromoterPicker && (
              <View style={styles.promoterList}>
                {promotersLoading ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ padding: 20 }} />
                ) : (
                  (promotersList || []).map((promoter: any) => (
                    <TouchableOpacity
                      key={promoter.id}
                      style={[
                        styles.promoterItem,
                        newEvent.promoterId === promoter.id && styles.promoterItemActive
                      ]}
                      onPress={() => {
                        setNewEvent(p => ({ ...p, promoterId: promoter.id, promoterName: promoter.name }));
                        setShowPromoterPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.promoterItemText,
                        newEvent.promoterId === promoter.id && styles.promoterItemTextActive
                      ]}>
                        {promoter.name}
                      </Text>
                      {promoter.verified && <CheckCircle size={14} color={COLORS.success} />}
                    </TouchableOpacity>
                  ))
                )}
                {!promotersLoading && (promotersList || []).length === 0 && (
                  <Text style={styles.noPromotersText}>Nenhum promotor encontrado</Text>
                )}
              </View>
            )}

            <Text style={styles.fieldLabel}>Local *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nome do local (ex: Altice Arena)"
              value={newEvent.venueName}
              onChangeText={(v) => setNewEvent(p => ({ ...p, venueName: v }))}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.fieldLabel}>Endereço *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Morada completa"
              value={newEvent.venueAddress}
              onChangeText={(v) => setNewEvent(p => ({ ...p, venueAddress: v }))}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.fieldLabel}>Cidade</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Cidade"
              value={newEvent.venueCity}
              onChangeText={(v) => setNewEvent(p => ({ ...p, venueCity: v }))}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.fieldLabel}>Data *</Text>
            <DatePicker
              date={newEvent.eventDate}
              onDateChange={(d) => setNewEvent(p => ({ ...p, eventDate: d }))}
              minimumDate={new Date()}
            />

            <Text style={styles.fieldLabel}>Hora *</Text>
            <TimePicker
              time={newEvent.eventTime}
              onTimeChange={(t) => setNewEvent(p => ({ ...p, eventTime: t }))}
            />

            <Text style={styles.fieldLabel}>Imagem do Evento</Text>
            {newEvent.image ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: newEvent.image }} style={styles.imagePreview} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setNewEvent(p => ({ ...p, image: '' }))}
                >
                  <X size={18} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.uploadArea}
                onPress={handlePickEventImage}
                disabled={isUploadingImage}
              >
                {isUploadingImage ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <>
                    <Calendar size={28} color={COLORS.primary} />
                    <Text style={styles.uploadText}>Fazer upload da imagem</Text>
                    <Text style={styles.uploadSubtext}>Toque para selecionar da galeria</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {!newEvent.image && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerTextLabel}>ou</Text>
                  <View style={styles.dividerLine} />
                </View>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Cole o URL da imagem"
                  value={newEvent.image}
                  onChangeText={(v) => setNewEvent(p => ({ ...p, image: v }))}
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                />
              </>
            )}

            <View style={styles.ticketsHeader}>
              <Text style={styles.fieldLabel}>Bilhetes *</Text>
              <TouchableOpacity style={styles.addTicketButton} onPress={addTicketType}>
                <Plus size={16} color={COLORS.primary} />
                <Text style={styles.addTicketButtonText}>Adicionar</Text>
              </TouchableOpacity>
            </View>

            {ticketTypes.map((ticket, index) => (
              <View key={ticket.id} style={styles.ticketCard}>
                <View style={styles.ticketCardHeader}>
                  <Text style={styles.ticketCardTitle}>
                    {ticket.name || `Bilhete ${index + 1}`}
                  </Text>
                  {ticketTypes.length > 1 && (
                    <TouchableOpacity onPress={() => removeTicketType(ticket.id)}>
                      <X size={18} color={COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput
                  style={styles.modalInput}
                  placeholder="Nome do bilhete (ex: Bilhete Normal)"
                  value={ticket.name}
                  onChangeText={(v) => updateTicketType(ticket.id, 'name', v)}
                  placeholderTextColor={COLORS.textSecondary}
                />

                <Text style={styles.ticketFieldLabel}>Stage / Tipo *</Text>
                <TouchableOpacity
                  style={styles.promoterSelector}
                  onPress={() => setShowStagePicker(showStagePicker === ticket.id ? null : ticket.id)}
                >
                  <Text style={[styles.promoterSelectorText, !ticket.stage && { color: COLORS.textSecondary }]}>
                    {ticket.stage || 'Selecionar stage'}
                  </Text>
                  <ChevronDown size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>

                {showStagePicker === ticket.id && (
                  <View style={styles.stageList}>
                    {TICKET_STAGES.map(stage => (
                      <TouchableOpacity
                        key={stage}
                        style={styles.stageItem}
                        onPress={() => {
                          updateTicketType(ticket.id, 'stage', stage);
                          setShowStagePicker(null);
                        }}
                      >
                        <Text style={styles.stageItemText}>{stage}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.dateTimeRow}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    placeholder="Preço (€)"
                    value={ticket.price}
                    onChangeText={(v) => updateTicketType(ticket.id, 'price', v)}
                    keyboardType="numeric"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    placeholder="Quantidade"
                    value={ticket.quantity}
                    onChangeText={(v) => updateTicketType(ticket.id, 'quantity', v)}
                    keyboardType="numeric"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>

                <TextInput
                  style={[styles.modalInput, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Descrição (opcional)"
                  value={ticket.description}
                  onChangeText={(v) => updateTicketType(ticket.id, 'description', v)}
                  multiline
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            ))}

            <TouchableOpacity style={styles.submitButton} onPress={handleCreateEvent}>
              <Plus size={20} color={COLORS.white} />
              <Text style={styles.submitButtonText}>Criar e Publicar Evento</Text>
            </TouchableOpacity>

            <View style={{ height: 60 }} />
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={showDetailModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Detalhes do Evento</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedEvent && (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {selectedEvent.imageUrl ? (
                <Image source={{ uri: selectedEvent.imageUrl }} style={styles.detailImage} resizeMode="cover" />
              ) : (
                <View style={[styles.detailImage, { backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center' }]}>
                  <Calendar size={48} color={COLORS.textSecondary} />
                </View>
              )}

              <View style={styles.detailContent}>
                <View style={styles.detailTitleRow}>
                  <Text style={styles.detailTitle}>{selectedEvent.title}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedEvent.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(selectedEvent.status) }]}>
                      {getStatusLabel(selectedEvent.status)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.detailPromoter}>Promotor: {selectedEvent.promoterName}</Text>

                <View style={styles.detailStatsGrid}>
                  <View style={styles.detailStatCard}>
                    <View style={[styles.detailStatIcon, { backgroundColor: COLORS.primary + '15' }]}>
                      <Ticket size={20} color={COLORS.primary} />
                    </View>
                    <Text style={styles.detailStatValue}>{selectedEvent.totalTickets}</Text>
                    <Text style={styles.detailStatLabel}>Total Bilhetes</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <View style={[styles.detailStatIcon, { backgroundColor: COLORS.success + '15' }]}>
                      <Users size={20} color={COLORS.success} />
                    </View>
                    <Text style={styles.detailStatValue}>{selectedEvent.soldTickets}</Text>
                    <Text style={styles.detailStatLabel}>Vendidos</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <View style={[styles.detailStatIcon, { backgroundColor: COLORS.warning + '15' }]}>
                      <DollarSign size={20} color={COLORS.warning} />
                    </View>
                    <Text style={styles.detailStatValue}>{`€${selectedEvent.revenue}`}</Text>
                    <Text style={styles.detailStatLabel}>Receita</Text>
                  </View>
                  <View style={styles.detailStatCard}>
                    <View style={[styles.detailStatIcon, { backgroundColor: COLORS.info + '15' }]}>
                      <Eye size={20} color={COLORS.info} />
                    </View>
                    <Text style={styles.detailStatValue}>{`€${selectedEvent.price}`}</Text>
                    <Text style={styles.detailStatLabel}>Pre\u00e7o Base</Text>
                  </View>
                </View>

                <View style={styles.detailInfoSection}>
                  <Text style={styles.detailSectionTitle}>Informa\u00e7\u00f5es</Text>
                  <View style={styles.detailInfoRow}>
                    <Calendar size={18} color={COLORS.primary} />
                    <View style={styles.detailInfoContent}>
                      <Text style={styles.detailInfoLabel}>Data</Text>
                      <Text style={styles.detailInfoValue}>{formatDate(selectedEvent.date)} \u00e0s {selectedEvent.time || '00:00'}</Text>
                    </View>
                  </View>
                  <View style={styles.detailInfoRow}>
                    <MapPin size={18} color={COLORS.primary} />
                    <View style={styles.detailInfoContent}>
                      <Text style={styles.detailInfoLabel}>Local</Text>
                      <Text style={styles.detailInfoValue}>{selectedEvent.venue}{selectedEvent.location ? `, ${selectedEvent.location}` : ''}</Text>
                    </View>
                  </View>
                  <View style={styles.detailInfoRow}>
                    <Star size={18} color={COLORS.primary} />
                    <View style={styles.detailInfoContent}>
                      <Text style={styles.detailInfoLabel}>Categoria</Text>
                      <Text style={styles.detailInfoValue}>{getCategoryLabel(selectedEvent.category)}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailInfoSection}>
                  <Text style={styles.detailSectionTitle}>Progresso de Vendas</Text>
                  <View style={styles.detailProgressContainer}>
                    <View style={styles.detailProgressBar}>
                      <View style={[styles.detailProgressFill, { width: `${selectedEvent.totalTickets > 0 ? Math.min((selectedEvent.soldTickets / selectedEvent.totalTickets) * 100, 100) : 0}%` }]} />
                    </View>
                    <Text style={styles.detailProgressText}>
                      {selectedEvent.totalTickets > 0 ? `${Math.round((selectedEvent.soldTickets / selectedEvent.totalTickets) * 100)}% vendidos` : 'Sem bilhetes'}
                    </Text>
                  </View>
                </View>

                {selectedEvent.status === 'pending' && (
                  <View style={styles.detailActions}>
                    <TouchableOpacity
                      style={[styles.detailActionBtn, { backgroundColor: COLORS.error }]}
                      onPress={() => { setShowDetailModal(false); handleEventAction(selectedEvent.id, 'reject'); }}
                    >
                      <XCircle size={18} color={COLORS.white} />
                      <Text style={styles.detailActionBtnText}>Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.detailActionBtn, { backgroundColor: COLORS.success }]}
                      onPress={() => { setShowDetailModal(false); handleEventAction(selectedEvent.id, 'approve'); }}
                    >
                      <CheckCircle size={18} color={COLORS.white} />
                      <Text style={styles.detailActionBtnText}>Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedEvent.status === 'published' && (
                  <View style={styles.detailActions}>
                    <TouchableOpacity
                      style={[styles.detailActionBtn, { backgroundColor: COLORS.warning }]}
                      onPress={() => { setShowDetailModal(false); handleEventAction(selectedEvent.id, 'cancel'); }}
                    >
                      <Ban size={18} color={COLORS.white} />
                      <Text style={styles.detailActionBtnText}>Cancelar Evento</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.detailActionBtn, { backgroundColor: COLORS.error }]}
                      onPress={() => { setShowDetailModal(false); handleEventAction(selectedEvent.id, 'delete'); }}
                    >
                      <Trash2 size={18} color={COLORS.white} />
                      <Text style={styles.detailActionBtnText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedEvent.status === 'cancelled' && (
                  <View style={styles.detailActions}>
                    <TouchableOpacity
                      style={[styles.detailActionBtn, { backgroundColor: COLORS.error }]}
                      onPress={() => { setShowDetailModal(false); handleEventAction(selectedEvent.id, 'delete'); }}
                    >
                      <Trash2 size={18} color={COLORS.white} />
                      <Text style={styles.detailActionBtnText}>Eliminar Evento</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={{ height: 60 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, padding: 20 },
  createButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 15, gap: 8,
  },
  createButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' as const },
  searchContainer: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  searchInputContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.text },
  filterButton: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 12, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  filterOptions: { flexDirection: 'row', marginBottom: 15, gap: 10, flexWrap: 'wrap' },
  filterOption: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.lightGray },
  filterOptionActive: { backgroundColor: COLORS.primary },
  filterOptionText: { fontSize: 14, color: COLORS.textSecondary },
  filterOptionTextActive: { color: COLORS.white, fontWeight: 'bold' as const },
  statsContainer: { flexDirection: 'row', marginBottom: 20, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 12, padding: 15, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  statNumber: { fontSize: 20, fontWeight: 'bold' as const, color: COLORS.primary, marginBottom: 5 },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  eventCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 15, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  eventHeader: { flexDirection: 'row', marginBottom: 15, gap: 12 },
  eventImage: { width: 60, height: 60, borderRadius: 8 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 4 },
  eventPromoter: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12, alignSelf: 'flex-start', gap: 4,
  },
  statusText: { fontSize: 12, fontWeight: 'bold' as const },
  eventDetails: { marginBottom: 15, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 14, color: COLORS.textSecondary, flex: 1 },
  eventStats: { flexDirection: 'row', marginBottom: 15, gap: 15 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: 'bold' as const, color: COLORS.primary, marginBottom: 2 },
  eventActions: { flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 8, gap: 6,
  },
  actionButtonText: { color: COLORS.white, fontSize: 14, fontWeight: 'bold' as const },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 10 },
  loadingContainer: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  profileButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 15, gap: 6,
  },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.white,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' as const, color: COLORS.text },
  modalContent: { flex: 1, padding: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600' as const, color: COLORS.text, marginBottom: 8, marginTop: 16 },
  modalInput: {
    backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  categoryScroll: { marginBottom: 8 },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: COLORS.lightGray, marginRight: 8,
  },
  categoryChipActive: { backgroundColor: COLORS.primary },
  categoryChipText: { fontSize: 14, color: COLORS.textSecondary },
  categoryChipTextActive: { color: COLORS.white, fontWeight: 'bold' as const },
  promoterSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  promoterSelectorText: { fontSize: 16, color: COLORS.text },
  promoterList: {
    backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 8, maxHeight: 200,
  },
  promoterItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  promoterItemActive: { backgroundColor: COLORS.primary + '10' },
  promoterItemText: { fontSize: 15, color: COLORS.text },
  promoterItemTextActive: { color: COLORS.primary, fontWeight: '600' as const },
  noPromotersText: { padding: 20, fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' as const },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 9999, paddingVertical: 16, marginTop: 24, gap: 8,
  },
  submitButtonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' as const },
  imagePreviewContainer: {
    position: 'relative' as const, borderRadius: 12, overflow: 'hidden', marginBottom: 8,
  },
  imagePreview: {
    width: '100%' as const, height: 180, borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute' as const, top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16, width: 32, height: 32, justifyContent: 'center' as const, alignItems: 'center' as const,
  },
  uploadArea: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 28, alignItems: 'center' as const,
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed' as const, marginBottom: 8, gap: 6,
  },
  uploadText: { fontSize: 15, fontWeight: '600' as const, color: COLORS.text },
  uploadSubtext: { fontSize: 13, color: COLORS.textSecondary },
  dividerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginVertical: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerTextLabel: { fontSize: 13, color: COLORS.textSecondary, marginHorizontal: 12 },
  ticketsHeader: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginTop: 16, marginBottom: 8,
  },
  addTicketButton: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.primary + '15', borderRadius: 8,
  },
  addTicketButtonText: { fontSize: 14, fontWeight: '600' as const, color: COLORS.primary },
  ticketCard: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  ticketCardHeader: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 12,
  },
  ticketCardTitle: { fontSize: 15, fontWeight: '600' as const, color: COLORS.primary },
  ticketFieldLabel: { fontSize: 13, fontWeight: '600' as const, color: COLORS.text, marginBottom: 6, marginTop: 4 },
  stageList: {
    backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 8, maxHeight: 180,
  },
  stageItem: {
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  stageItemText: { fontSize: 15, color: COLORS.text },
  detailImage: {
    width: '100%' as const, height: 220, borderRadius: 0,
  },
  detailContent: {
    padding: 20,
  },
  detailTitleRow: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, marginBottom: 8,
  },
  detailTitle: {
    fontSize: 22, fontWeight: 'bold' as const, color: COLORS.text, flex: 1, marginRight: 12,
  },
  detailPromoter: {
    fontSize: 14, color: COLORS.textSecondary, marginBottom: 20,
  },
  detailStatsGrid: {
    flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12, marginBottom: 24,
  },
  detailStatCard: {
    flex: 1, minWidth: 140, backgroundColor: COLORS.white, borderRadius: 12, padding: 16, alignItems: 'center' as const,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  detailStatIcon: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center' as const, alignItems: 'center' as const, marginBottom: 8,
  },
  detailStatValue: {
    fontSize: 18, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 2,
  },
  detailStatLabel: {
    fontSize: 12, color: COLORS.textSecondary,
  },
  detailInfoSection: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  detailSectionTitle: {
    fontSize: 16, fontWeight: 'bold' as const, color: COLORS.text, marginBottom: 16,
  },
  detailInfoRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 14,
  },
  detailInfoContent: {
    flex: 1,
  },
  detailInfoLabel: {
    fontSize: 12, color: COLORS.textSecondary, marginBottom: 2,
  },
  detailInfoValue: {
    fontSize: 15, color: COLORS.text, fontWeight: '500' as const,
  },
  detailProgressContainer: {
    marginTop: 8,
  },
  detailProgressBar: {
    height: 8, backgroundColor: COLORS.lightGray, borderRadius: 4, overflow: 'hidden' as const, marginBottom: 8,
  },
  detailProgressFill: {
    height: '100%' as const, backgroundColor: COLORS.primary, borderRadius: 4,
  },
  detailProgressText: {
    fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' as const,
  },
  detailActions: {
    flexDirection: 'row' as const, gap: 12, marginTop: 24,
  },
  detailActionBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: 14, borderRadius: 9999, gap: 8,
  },
  detailActionBtnText: {
    color: COLORS.white, fontSize: 16, fontWeight: 'bold' as const,
  },
});
