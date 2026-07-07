import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gift } from 'lucide-react-native';
import { COLORS } from '@/constants/colors';
import { Event } from '@/types/event';

/**
 * Returns true when an event has no paid ticket types
 * (no ticket types at all, or every ticket is priced at 0).
 */
export function isFreeEvent(event: { ticketTypes?: { price: number }[] } | Event | undefined | null): boolean {
  if (!event) return false;
  const tt = (event as any).ticketTypes;
  if (!tt || !Array.isArray(tt) || tt.length === 0) return true;
  return Math.min(...tt.map((t: { price: number }) => Number(t.price) || 0)) === 0;
}

interface FreeBadgeProps {
  size?: 'sm' | 'md';
  style?: any;
}

/**
 * Small green "Grátis" pill used on event cards and ticket sections
 * to visually flag free events.
 */
export function FreeBadge({ size = 'sm', style }: FreeBadgeProps) {
  const isSmall = size === 'sm';
  return (
    <View style={[styles.badge, isSmall ? styles.badgeSm : styles.badgeMd, style]}>
      <Gift size={isSmall ? 11 : 13} color="#fff" />
      <Text style={[styles.text, isSmall ? styles.textSm : styles.textMd]}>Grátis</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success,
    borderRadius: 9999,
    gap: 3,
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeMd: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    color: '#fff',
    fontWeight: 'bold' as const,
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 10,
  },
  textMd: {
    fontSize: 12,
  },
});
