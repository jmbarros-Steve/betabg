import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, sizes } from '../theme.js';

const styles = StyleSheet.create({
  card: {
    width: '48%',
    minHeight: sizes.kpiCardHeight,
    padding: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 0.5,
    borderColor: colors.textDivider,
    borderRadius: 4,
    marginBottom: 8,
  },
  cardAccent: {
    borderLeftWidth: 3,
    borderLeftColor: colors.meta,
  },
  label: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  value: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.navy, marginTop: 6, marginBottom: 4 },
  delta: { fontFamily: fonts.sans, fontSize: sizes.small },
  deltaPos: { color: colors.positive },
  deltaNeg: { color: colors.negative },
  deltaZero: { color: colors.textMuted },
  deltaLabel: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, marginLeft: 3 },
  caption: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted, marginTop: 3 },
});

interface KpiCardProps {
  label: string;
  value: string;
  deltaSign?: '+' | '-' | '';
  deltaPct?: string;
  deltaIsPositive?: boolean;
  deltaCaption?: string;
  caption?: string;
  accent?: boolean;
}

export function KpiCard({ label, value, deltaSign, deltaPct, deltaIsPositive, deltaCaption, caption, accent }: KpiCardProps) {
  const deltaStyle = !deltaSign
    ? styles.deltaZero
    : deltaIsPositive
      ? styles.deltaPos
      : styles.deltaNeg;

  return (
    <View style={[styles.card, accent ? styles.cardAccent : {}]}>
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
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}
