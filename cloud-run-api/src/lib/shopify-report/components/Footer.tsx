import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, sizes } from '../theme.js';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: sizes.margin,
    right: sizes.margin,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: colors.textDivider,
  },
  brand: { fontFamily: fonts.sansBold, fontSize: sizes.micro, color: colors.navy, letterSpacing: 1 },
  pageNumber: { fontFamily: fonts.sans, fontSize: sizes.micro, color: colors.textMuted },
});

export function Footer() {
  return (
    <View style={styles.container} fixed>
      <Text style={styles.brand}>STEVE ADS · TU AGENCIA AI 24/7</Text>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}
