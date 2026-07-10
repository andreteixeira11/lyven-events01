import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

interface BackButtonProps {
  onPress: () => void;
  color?: string;
  size?: number;
  circleSize?: number;
  backgroundColor?: string;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
}

/**
 * Reusable circular back button with a perfectly centered arrow icon.
 * The icon marginLeft compensates for lucide's ArrowLeft internal
 * visual asymmetry so the arrow is visually centered within the circle.
 */
export default function BackButton({
  onPress,
  color = '#fff',
  size = 24,
  circleSize = 36,
  backgroundColor = 'rgba(0,0,0,0.2)',
  hitSlop = { top: 10, bottom: 10, left: 10, right: 10 },
}: BackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={hitSlop}
      style={[
        styles.circle,
        {
          width: circleSize,
          height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor,
        },
      ]}
    >
      <ArrowLeft size={size} color={color} style={styles.icon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginLeft: 3,
  },
});
