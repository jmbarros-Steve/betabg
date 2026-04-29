import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, sizes, formatDateRange } from '../theme.js';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.textDivider,
    marginBottom: 18,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 22, height: 22, objectFit: 'contain' },
  shopName: { fontFamily: fonts.serifBold, fontSize: sizes.small, color: colors.navy },
  reportLabel: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.meta, letterSpacing: 1.2 },
  right: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted },
});

interface HeaderProps {
  shopName: string;
  logoUrl: string | null;
  periodStart: string;
  periodEnd: string;
}

export function Header({ shopName, logoUrl, periodStart, periodEnd }: HeaderProps) {
  return (
    <View style={styles.container} fixed>
      <View style={styles.left}>
        {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
        <View>
          <Text style={styles.shopName}>{shopName}</Text>
          <Text style={styles.reportLabel}>REPORTE META ADS</Text>
        </View>
      </View>
      <Text style={styles.right}>{formatDateRange(periodStart, periodEnd)}</Text>
    </View>
  );
}
