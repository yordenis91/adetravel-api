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
  docNumber: { fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 16 },
  clientLine: { marginBottom: 12 },
  table: { marginBottom: 20 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderCell: { color: "#fff", fontSize: 8, textTransform: "uppercase", fontWeight: 700 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 6, paddingHorizontal: 8 },
  tableCell: { fontSize: 9 },
  colService: { width: "22%" }, colDesc: { width: "38%" }, colQty: { width: "10%", textAlign: "center" },
  colPrice: { width: "15%", textAlign: "right" }, colTotal: { width: "15%", textAlign: "right" },
  totalsTable: { alignSelf: "flex-end", width: 220, marginTop: 4 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: NAVY, color: "#fff", padding: 8, fontWeight: 700, fontSize: 12 },
  notes: { marginTop: 24 },
  notesTitle: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
});

interface QuotationItem { service: string; description: string; quantity: number; unitPrice: number; total: number }

interface QuotationDocumentProps {
  quotationNumber: string;
  currency: string;
  clientName: string;
  items: QuotationItem[];
  subtotal: number;
  taxPercentage: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
}

const fmt = (n: number) => n.toLocaleString("es-CL");

export function QuotationDocument({ quotationNumber, currency, clientName, items, subtotal, taxPercentage, taxAmount, total, notes }: QuotationDocumentProps) {
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

        <Text style={styles.docTitle}>Cotización de Servicios</Text>
        <Text style={styles.docNumber}>{quotationNumber}</Text>
        <Text style={styles.clientLine}>Cliente: {clientName}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.colService]}>Servicio</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Descripción</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Cant.</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>P. Unit.</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
          </View>
          {items.map((item, i) => (
            <View style={styles.tableRow} key={i}>
              <Text style={[styles.tableCell, styles.colService]}>{item.service}</Text>
              <Text style={[styles.tableCell, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.tableCell, styles.colPrice]}>{currency} {fmt(item.unitPrice)}</Text>
              <Text style={[styles.tableCell, styles.colTotal]}>{currency} {fmt(item.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsTable}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{currency} {fmt(subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>IVA ({taxPercentage}%)</Text>
            <Text>{currency} {fmt(taxAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>TOTAL</Text>
            <Text>{currency} {fmt(total)}</Text>
          </View>
        </View>

        {notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Notas</Text>
            <Text>{notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
