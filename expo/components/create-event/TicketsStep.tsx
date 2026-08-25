import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ticket, Plus, Trash2, ChevronDown, ChevronUp, Gift, Lock } from 'lucide-react-native';

export interface TicketTypeForm {
  id: string;
  name: string;
  stage: string;
  price: string;
  quantity: string;
  description: string;
  /** Phase status: active tickets are on sale; blocked ones are hidden from purchase (e.g. "Fase 1" when "Fase 2" opens) */
  active?: boolean;
}

interface TicketsStepProps {
  tickets: TicketTypeForm[];
  isFreeEvent: boolean;
  onToggleFree: (isFree: boolean) => void;
  onAddTicket: () => void;
  onRemoveTicket: (id: string) => void;
  onUpdateTicket: (id: string, field: keyof TicketTypeForm, value: string) => void;
  onToggleTicketActive: (id: string) => void;
}

const ticketStages = [
  'Early Bird',
  'Normal',
  'VIP',
  'Premium',
  'Gold',
  'Silver',
  'Bronze',
  'Mesa',
  'Pista',
  'Camarote',
  'Balcão',
  'Geral',
];

export default function TicketsStep({
  tickets,
  isFreeEvent,
  onToggleFree,
  onAddTicket,
  onRemoveTicket,
  onUpdateTicket,
  onToggleTicketActive,
}: TicketsStepProps) {
  const [expandedTickets, setExpandedTickets] = React.useState<Set<string>>(new Set(['1']));
  const [showStagePicker, setShowStagePicker] = React.useState<string | null>(null);

  const toggleTicketExpansion = (id: string) => {
    setExpandedTickets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const isTicketFilled = (ticket: TicketTypeForm): boolean => {
    if (isFreeEvent) {
      return !!(ticket.name && ticket.stage && ticket.quantity);
    }
    return !!(ticket.name && ticket.stage && ticket.price && ticket.quantity);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bilhetes</Text>
      <Text style={styles.subtitle}>
        Configure os tipos de bilhetes disponíveis
      </Text>

      <TouchableOpacity
        style={[styles.freeEventCard, isFreeEvent && styles.freeEventCardActive]}
        onPress={() => onToggleFree(!isFreeEvent)}
        activeOpacity={0.7}
      >
        <View style={[styles.freeEventIcon, isFreeEvent && styles.freeEventIconActive]}>
          <Gift size={22} color={isFreeEvent ? '#fff' : '#0099a8'} />
        </View>
        <View style={styles.freeEventContent}>
          <Text style={[styles.freeEventTitle, isFreeEvent && styles.freeEventTitleActive]}>
            Evento Gratuito
          </Text>
          <Text style={styles.freeEventDescription}>
            {isFreeEvent
              ? 'Todos os bilhetes serão gratuitos (€0.00)'
              : 'Ative para criar um evento de entrada livre'}
          </Text>
        </View>
        <View style={[styles.freeEventToggle, isFreeEvent && styles.freeEventToggleActive]}>
          <View style={[styles.freeEventToggleKnob, isFreeEvent && styles.freeEventToggleKnobActive]} />
        </View>
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ticket size={20} color="#0099a8" />
          <Text style={styles.headerTitle}>Tipos de Bilhetes *</Text>
        </View>
        <TouchableOpacity onPress={onAddTicket} style={styles.addButton}>
          <Plus size={18} color="#0099a8" />
          <Text style={styles.addButtonText}>Adicionar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.ticketsList} showsVerticalScrollIndicator={false}>
        {tickets.map((ticket, index) => {
          const isExpanded = expandedTickets.has(ticket.id);
          const isFilled = isTicketFilled(ticket);
          
          return (
            <View 
              key={ticket.id} 
              style={[styles.ticketCard, !isExpanded && isFilled && styles.ticketCardCollapsed]}
            >
              <TouchableOpacity 
                style={styles.ticketHeader}
                onPress={() => toggleTicketExpansion(ticket.id)}
                activeOpacity={0.7}
              >
                <View style={styles.ticketHeaderLeft}>
                  <Text style={styles.ticketTitle}>
                    {ticket.name || `Bilhete ${index + 1}`}
                  </Text>
                  {!isExpanded && isFilled && (
                    <Text style={styles.ticketSubtitle}>
                      {ticket.active === false ? 'Bloqueado • ' : ''}{ticket.stage} • {isFreeEvent ? 'Grátis' : `€${ticket.price}`} • {ticket.quantity} bilhetes
                    </Text>
                  )}
                </View>
                <View style={styles.ticketHeaderRight}>
                  {tickets.length > 1 && (
                    <TouchableOpacity 
                      onPress={(e) => {
                        e.stopPropagation();
                        onRemoveTicket(ticket.id);
                      }}
                      style={styles.deleteButton}
                    >
                      <Trash2 size={18} color="#ff3b30" />
                    </TouchableOpacity>
                  )}
                  {isExpanded ? <ChevronUp size={20} color="#0099a8" /> : <ChevronDown size={20} color="#0099a8" />}
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <>
                  <TouchableOpacity
                    style={[styles.phaseToggleRow, ticket.active === false && styles.phaseToggleRowBlocked]}
                    onPress={() => onToggleTicketActive(ticket.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.phaseToggleIcon}>
                      <Lock size={16} color={ticket.active === false ? '#FFA500' : '#0099a8'} />
                    </View>
                    <View style={styles.phaseToggleContent}>
                      <Text style={[styles.phaseToggleTitle, ticket.active === false && styles.phaseToggleTitleBlocked]}>
                        {ticket.active === false ? 'Fase bloqueada' : 'Fase ativa'}
                      </Text>
                      <Text style={styles.phaseToggleDescription}>
                        {ticket.active === false
                          ? 'Não está disponível para venda'
                          : 'À venda na aplicação'}
                      </Text>
                    </View>
                    <View style={[styles.freeEventToggle, ticket.active !== false && styles.freeEventToggleActive]}>
                      <View style={[styles.freeEventToggleKnob, ticket.active !== false && styles.freeEventToggleKnobActive]} />
                    </View>
                  </TouchableOpacity>

                  <TextInput
                    style={styles.input}
                    value={ticket.name}
                    onChangeText={(text) => onUpdateTicket(ticket.id, 'name', text)}
                    placeholder="Nome do bilhete (ex: Bilhete Normal)"
                    placeholderTextColor="#999"
                  />

                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Stage / Tipo</Text>
                    <TouchableOpacity 
                      style={styles.stageButton} 
                      onPress={() => setShowStagePicker(showStagePicker === ticket.id ? null : ticket.id)}
                    >
                      <Text style={[styles.stageButtonText, !ticket.stage && styles.placeholder]}>
                        {ticket.stage || 'Selecionar stage'}
                      </Text>
                      <ChevronDown size={20} color="#666" />
                    </TouchableOpacity>
                    
                    {showStagePicker === ticket.id && (
                      <View style={styles.stageListContainer}>
                        <ScrollView style={styles.stageList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                          {ticketStages.map((stage) => (
                            <TouchableOpacity
                              key={stage}
                              style={styles.stageItem}
                              onPress={() => {
                                onUpdateTicket(ticket.id, 'stage', stage);
                                setShowStagePicker(null);
                              }}
                            >
                              <Text style={styles.stageItemText}>{stage}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <View style={styles.row}>
                    <View style={[styles.inputContainer, styles.halfWidth]}>
                      <Text style={styles.inputLabel}>Preço (€)</Text>
                      {isFreeEvent ? (
                        <View style={[styles.input, styles.freePriceBox]}>
                          <Text style={styles.freePriceText}>Grátis</Text>
                        </View>
                      ) : (
                        <TextInput
                          style={styles.input}
                          value={ticket.price}
                          onChangeText={(text) => onUpdateTicket(ticket.id, 'price', text)}
                          placeholder="0.00"
                          placeholderTextColor="#999"
                          keyboardType="numeric"
                        />
                      )}
                    </View>

                    <View style={[styles.inputContainer, styles.halfWidth]}>
                      <Text style={styles.inputLabel}>Quantidade</Text>
                      <TextInput
                        style={styles.input}
                        value={ticket.quantity}
                        onChangeText={(text) => onUpdateTicket(ticket.id, 'quantity', text)}
                        placeholder="100"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={ticket.description}
                    onChangeText={(text) => onUpdateTicket(ticket.id, 'description', text)}
                    placeholder="Descrição (opcional)"
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={2}
                  />
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#333',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e0f5f7',
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#0099a8',
  },
  ticketsList: {
    flex: 1,
  },
  ticketCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  ticketCardCollapsed: {
    padding: 12,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ticketHeaderLeft: {
    flex: 1,
  },
  ticketHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#0099a8',
  },
  ticketSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  phaseToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f5f7',
    borderWidth: 1,
    borderColor: '#0099a8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  phaseToggleRowBlocked: {
    backgroundColor: '#FFF8EC',
    borderColor: '#FFA500',
  },
  phaseToggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 153, 168, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseToggleContent: {
    flex: 1,
  },
  phaseToggleTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#0099a8',
  },
  phaseToggleTitleBlocked: {
    color: '#B45309',
  },
  phaseToggleDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  deleteButton: {
    padding: 4,
  },
  inputContainer: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  stageButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageButtonText: {
    fontSize: 16,
    color: '#333',
  },
  placeholder: {
    color: '#999',
  },
  stageListContainer: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  stageList: {
    maxHeight: 150,
  },
  stageItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  stageItemText: {
    fontSize: 16,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  freeEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  freeEventCardActive: {
    borderColor: '#0099a8',
    backgroundColor: '#e0f5f7',
  },
  freeEventIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e0f5f7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  freeEventIconActive: {
    backgroundColor: '#0099a8',
  },
  freeEventContent: {
    flex: 1,
  },
  freeEventTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#333',
    marginBottom: 2,
  },
  freeEventTitleActive: {
    color: '#0099a8',
  },
  freeEventDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  freeEventToggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  freeEventToggleActive: {
    backgroundColor: '#0099a8',
  },
  freeEventToggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  freeEventToggleKnobActive: {
    alignSelf: 'flex-end',
  },
  freePriceBox: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0f5f7',
    borderColor: '#0099a8',
  },
  freePriceText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#0099a8',
  },
});
