import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#0F1E3C";
const GOLD = "#C9A84C";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a1a2e", fontFamily: "Helvetica" },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    borderBottomWidth: 3, borderBottomColor: NAVY, paddingBottom: 16, marginBottom: 24
  },
  agencyName: { fontSize: 16, fontWeight: 700, color: NAVY },
  docTitle: { fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 },
  docNumber: { fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 4 },
  statusBadge: { fontSize: 9, color: NAVY, fontWeight: 700, marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: NAVY, textTransform: "uppercase", marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 140, fontWeight: 700 },
  value: { flex: 1 },
  confirmationBox: {
    borderWidth: 1, borderColor: GOLD, backgroundColor: "#FDF8EC",
    padding: 12, marginBottom: 16, alignItems: "center"
  },
  confirmationLabel: { fontSize: 8, textTransform: "uppercase", color: "#8a6d1a", marginBottom: 4 },
  confirmationCode: { fontSize: 18, fontWeight: 800, color: NAVY },
  passenger: { fontSize: 9, marginBottom: 2 },
  footer: { marginTop: 30, fontSize: 8, color: "#888", textAlign: "center" },
});

interface VoucherDocumentProps {
  voucherNumber: string;
  status: string;
  serviceType?: string | null;
  serviceName?: string | null;
  serviceDetails?: string | null;
  destination?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  clientName: string;
  providerName?: string | null;
  passengerNames: string[];
  confirmationCode?: string | null;
  notes?: string | null;
  amount?: number | null;
  currency?: string | null;
}

export function VoucherDocument({
  voucherNumber, status, serviceType, serviceName, serviceDetails, destination,
  checkIn, checkOut, clientName, providerName, passengerNames, confirmationCode,
  notes, amount, currency,
}: VoucherDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.agencyName}>ADE Travel</Text>
            <Text>RUT: 76.XXX.XXX-X</Text>
          </View>
          <Text>Fecha: {new Date().toLocaleDateString("es-CL")}</Text>
        </View>

        <Text style={styles.docTitle}>Voucher de Servicio</Text>
        <Text style={styles.docNumber}>{voucherNumber}</Text>
        <Text style={styles.statusBadge}>Estado: {status}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servicio</Text>
          <View style={styles.row}><Text style={styles.label}>Tipo</Text><Text style={styles.value}>{serviceType || "-"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Nombre</Text><Text style={styles.value}>{serviceName || "-"}</Text></View>
          {destination ? <View style={styles.row}><Text style={styles.label}>Destino</Text><Text style={styles.value}>{destination}</Text></View> : null}
          {checkIn ? <View style={styles.row}><Text style={styles.label}>Check-in</Text><Text style={styles.value}>{checkIn}</Text></View> : null}
          {checkOut ? <View style={styles.row}><Text style={styles.label}>Check-out</Text><Text style={styles.value}>{checkOut}</Text></View> : null}
          {serviceDetails ? <View style={styles.row}><Text style={styles.label}>Detalles</Text><Text style={styles.value}>{serviceDetails}</Text></View> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente y proveedor</Text>
          <View style={styles.row}><Text style={styles.label}>Cliente</Text><Text style={styles.value}>{clientName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Proveedor</Text><Text style={styles.value}>{providerName || "-"}</Text></View>
          {amount != null ? (
            <View style={styles.row}><Text style={styles.label}>Monto</Text><Text style={styles.value}>{currency} {amount.toLocaleString("es-CL")}</Text></View>
          ) : null}
        </View>

        {confirmationCode ? (
          <View style={styles.confirmationBox}>
            <Text style={styles.confirmationLabel}>Código de confirmación</Text>
            <Text style={styles.confirmationCode}>{confirmationCode}</Text>
          </View>
        ) : null}

        {passengerNames.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pasajeros</Text>
            {passengerNames.map((name, i) => <Text key={i} style={styles.passenger}>• {name}</Text>)}
          </View>
        ) : null}

        {notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text>{notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>Este voucher es un comprobante de servicio emitido por ADE Travel. Presentar junto a un documento de identidad.</Text>
      </Page>
    </Document>
  );
}
