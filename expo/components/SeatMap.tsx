/**
 * SeatMap — Visual interactive seat selection for venues with numbered seats.
 * Used for Teatro Baltazar Dias and similar venues with a known layout.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { Armchair, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/theme-context';
import { RADIUS, SPACING } from '@/constants/colors';
import {
  BALTAZAR_DIAS_SEAT_MAP,
  VenueSeatMap,
  SeatSection,
  SeatDef,
} from '@/constants/venue-seat-maps';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Seat visual sizing
const SEAT_SIZE = 22;
const SEAT_GAP = 4;
const ROW_GAP = 8;
const AISLE_GAP = 14;

export type SeatRowData = {
  id: string;
  label: string;
  seats: SeatDef[];
};

export type SeatStateMap = Record<string, 'available' | 'selected' | 'booked' | 'reserved' | 'blocked'>;

interface SeatMapProps {
  /** The seat map layout (from venue-seat-maps constants). */
  map: VenueSeatMap;
  /** Current seat states keyed by seat_label. Seats not present are treated as 'available'. */
  seatStates: SeatStateMap;
  /** Currently selected seat labels (local selection). */
  selectedSeats: string[];
  /** Called when the user toggles a seat. */
  onToggleSeat: (seatLabel: string) => void;
  /** Max number of seats a user can select. */
  maxSelectable?: number;
  /** Called when the user tries to exceed maxSelectable (for an alert). */
  onMaxExceeded?: () => void;
}

/**
 * Individual seat bubble.
 */
const Seat = React.memo(function Seat({
  seat,
  state,
  accent,
  selected,
  onPress,
}: {
  seat: SeatDef;
  state: 'available' | 'selected' | 'booked' | 'reserved' | 'blocked';
  accent: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  const isAvailable = state === 'available' && !selected;
  const isSelected = selected || state === 'selected';
  const isBooked = state === 'booked';
  const isReserved = state === 'reserved';
  const isBlocked = state === 'blocked';
  const disabled = isBooked || isReserved || isBlocked;

  let bgColor = colors.card;
  let borderColor = colors.border;
  let textColor = colors.textSecondary;
  let iconColor = colors.textSecondary;

  if (isAvailable) {
    bgColor = colors.card;
    borderColor = accent;
    textColor = colors.textSecondary;
    iconColor = accent;
  } else if (isSelected) {
    bgColor = accent;
    borderColor = accent;
    textColor = '#FFFFFF';
    iconColor = '#FFFFFF';
  } else if (isBooked) {
    bgColor = colors.border;
    borderColor = colors.border;
    textColor = colors.textLight;
    iconColor = colors.textLight;
  } else if (isReserved) {
    bgColor = colors.warning + '40';
    borderColor = colors.warning;
    textColor = colors.warning;
    iconColor = colors.warning;
  } else if (isBlocked) {
    bgColor = colors.border;
    borderColor = colors.border;
    textColor = colors.textLight;
    iconColor = colors.textLight;
  }

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityLabel={`${seat.section}, fila ${seat.rowLabel}, lugar ${seat.seatNumber}${isBooked ? ' (ocupado)' : isSelected ? ' (selecionado)' : ''}`}
      accessibilityRole="button"
      style={[
        styles.seat,
        {
          width: SEAT_SIZE,
          height: SEAT_SIZE,
          backgroundColor: bgColor,
          borderColor,
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
    >
      <Armchair size={12} color={iconColor} strokeWidth={2.2} />
    </TouchableOpacity>
  );
});

/**
 * Renders a single row of seats.
 */
const SeatRowView = React.memo(function SeatRowView({
  row,
  seatStates,
  selectedSet,
  accent,
  onToggleSeat,
}: {
  row: SeatRowData;
  seatStates: SeatStateMap;
  selectedSet: Set<string>;
  accent: string;
  onToggleSeat: (label: string) => void;
}) {
  const { colors } = useTheme();

  // Split into two halves with an aisle in the middle
  const mid = Math.ceil(row.seats.length / 2);
  const left = row.seats.slice(0, mid);
  const right = row.seats.slice(mid);

  const renderSeat = (seat: SeatDef) => {
    const state = seatStates[seat.id] || 'available';
    const selected = selectedSet.has(seat.id);
    return (
      <Seat
        key={seat.id}
        seat={seat}
        state={state}
        accent={accent}
        selected={selected}
        onPress={() => onToggleSeat(seat.id)}
      />
    );
  };

  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {row.label}
      </Text>
      <View style={styles.rowSeats}>
        <View style={styles.rowHalf}>{left.map(renderSeat)}</View>
        <View style={styles.aisle} />
        <View style={styles.rowHalf}>{right.map(renderSeat)}</View>
      </View>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {row.label}
      </Text>
    </View>
  );
});

/**
 * Renders a box-style section (camarotes).
 */
const BoxSection = React.memo(function BoxSection({
  section,
  seatStates,
  selectedSet,
  onToggleSeat,
}: {
  section: SeatSection;
  seatStates: SeatStateMap;
  selectedSet: Set<string>;
  onToggleSeat: (label: string) => void;
}) {
  const { colors } = useTheme();
  const accent = section.accent || colors.primary;

  return (
    <View style={[styles.boxSection, { borderColor: colors.border }]}>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        {section.name}
      </Text>
      <View style={styles.boxGrid}>
        {section.rows.map((row) => (
          <View key={row.id} style={styles.boxRow}>
            <Text style={[styles.boxLabel, { color: colors.textSecondary }]}>
              {row.label}
            </Text>
            <View style={styles.boxSeats}>
              {row.seats.map((seat) => {
                const state = seatStates[seat.id] || 'available';
                const selected = selectedSet.has(seat.id);
                return (
                  <Seat
                    key={seat.id}
                    seat={seat}
                    state={state}
                    accent={accent}
                    selected={selected}
                    onPress={() => onToggleSeat(seat.id)}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

/**
 * Legend showing seat status colors.
 */
const Legend = React.memo(function Legend() {
  const { colors } = useTheme();
  const items = [
    { label: 'Livre', color: colors.card, border: colors.primary },
    { label: 'Selecionado', color: colors.primary, border: colors.primary },
    { label: 'Ocupado', color: colors.border, border: colors.border },
    { label: 'Reservado', color: colors.warning + '40', border: colors.warning },
  ];
  return (
    <View style={styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: item.color, borderColor: item.border },
            ]}
          >
            <Armchair size={9} color={item.label === 'Selecionado' ? '#FFFFFF' : item.border} strokeWidth={2.2} />
          </View>
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
});

export function SeatMap({
  map,
  seatStates,
  selectedSeats,
  onToggleSeat,
  maxSelectable = 6,
  onMaxExceeded,
}: SeatMapProps) {
  const { colors } = useTheme();
  const selectedSet = useMemo(() => new Set(selectedSeats), [selectedSeats]);

  const handleToggle = useCallback(
    (seatLabel: string) => {
      if (selectedSet.has(seatLabel)) {
        onToggleSeat(seatLabel);
        return;
      }
      // Selecting a new seat
      if (selectedSeats.length >= maxSelectable) {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        onMaxExceeded?.();
        return;
      }
      onToggleSeat(seatLabel);
    },
    [selectedSet, selectedSeats.length, maxSelectable, onToggleSeat, onMaxExceeded]
  );

  return (
    <View style={styles.container}>
      <Legend />

      {/* Stage */}
      <View style={[styles.stage, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
        <Text style={[styles.stageText, { color: colors.primary }]}>PALCO</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        <View style={styles.mapInner}>
          {map.sections.map((section) => {
            if (section.shape === 'box') {
              return (
                <BoxSection
                  key={section.id}
                  section={section}
                  seatStates={seatStates}
                  selectedSet={selectedSet}
                  onToggleSeat={handleToggle}
                />
              );
            }
            // fan / straight
            const accent = section.accent || colors.primary;
            return (
              <View key={section.id} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {section.name}
                </Text>
                <View style={styles.rowsContainer}>
                  {section.rows.map((row) => (
                    <SeatRowView
                      key={row.id}
                      row={row}
                      seatStates={seatStates}
                      selectedSet={selectedSet}
                      accent={accent}
                      onToggleSeat={handleToggle}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Selected seats summary */}
      <View style={[styles.summaryBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
          {selectedSeats.length} lugar(es) selecionado(s)
        </Text>
        {selectedSeats.length > 0 && (
          <View style={styles.selectedChips}>
            {selectedSeats.slice(0, 4).map((label) => (
              <View key={label} style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>
                  {label.replace(/-/g, ' ').toUpperCase()}
                </Text>
              </View>
            ))}
            {selectedSeats.length > 4 && (
              <Text style={[styles.chipMore, { color: colors.textSecondary }]}>
                +{selectedSeats.length - 4}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.md,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendText: {
    fontSize: 11,
  },
  stage: {
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.lg,
  },
  stageText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  mapInner: {
    gap: SPACING.xl,
    minWidth: SCREEN_WIDTH - SPACING.lg * 2,
  },
  section: {
    gap: SPACING.xs,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  rowsContainer: {
    gap: ROW_GAP,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rowLabel: {
    fontSize: 10,
    width: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  rowSeats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowHalf: {
    flexDirection: 'row',
    gap: SEAT_GAP,
  },
  aisle: {
    width: AISLE_GAP,
  },
  seat: {
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxSection: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  boxGrid: {
    gap: ROW_GAP,
  },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  boxLabel: {
    fontSize: 10,
    width: 24,
    fontWeight: '600',
  },
  boxSeats: {
    flexDirection: 'row',
    gap: SEAT_GAP,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginHorizontal: SPACING.md,
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
    justifyContent: 'flex-end',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chipMore: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
});

export { BALTAZAR_DIAS_SEAT_MAP };
