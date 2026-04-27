import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, sizes } from '../theme.js';

const styles = StyleSheet.create({
  card: {
    width: '32%',
    height: sizes.kpiCardHeight,
    padding: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 0.5,
    borderColor: colors.textDivider,
    borderRadius: 4,
    marginBottom: 6,
  },
  label: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  value: { fontFamily: fonts.serifBold, fontSize: 20, color: colors.navy, marginTop: 6, marginBottom: 4 },
  delta: { fontFamily: fonts.sans, fontSize: sizes.micro },
  deltaPos: { color: colors.positive },
  deltaNeg: { color: colors.negative },
  deltaZero: { color: colors.textMuted },
  deltaLabel: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, marginLeft: 3 },
});

interface KpiCardProps {
  label: string;
  value: string;
  deltaSign?: '+' | '-' | '';
  deltaPct?: string;
  deltaIsPositive?: boolean;
  deltaCaption?: string;
}

export function KpiCard({ label, value, deltaSign, deltaPct, deltaIsPositive, deltaCaption }: KpiCardProps) {
  const deltaStyle = !deltaSign
    ? styles.deltaZero
    : deltaIsPositive
      ? styles.deltaPos
      : styles.deltaNeg;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {deltaPct && deltaPct !== '—' ? (
        <Text style={[styles.delta, deltaStyle]}>
          {deltaSign}
          {deltaPct}
          <Text style={styles.deltaLabel}> {deltaCaption || 'vs período anterior'}</Text>
        </Text>
      ) : (
        <Text style={[styles.delta, styles.deltaZero]}>{deltaCaption || 'sin comparable'}</Text>
      )}
    </View>
  );
}
