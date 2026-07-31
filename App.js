import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { generateFutureYou } from "./src/api/generateFutureYou";
import { computePace } from "./src/pace/paceEngine";
import { loadGoal, saveGoal } from "./src/storage/goalStorage";
import { API_BASE_URL } from "./src/config";

const TABS = [
  { id: "visual", label: "Fremtid" },
  { id: "pace", label: "Tempo" },
  { id: "devices", label: "Enheter" },
];

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_GOAL = {
  title: "Atletisk fysikk",
  metricLabel: "Treningsøkter / uke",
  startValue: "2",
  targetValue: "5",
  currentValue: "2",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: daysFromNow(84),
};

export default function App() {
  const [tab, setTab] = useState("visual");
  const [maal, setMaal] = useState("bedre kondisjon og atletisk form i treningstøy");
  const [intensity, setIntensity] = useState("moderate");
  const [bildeUri, setBildeUri] = useState(null);
  const [aiBilde, setAiBilde] = useState(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [laster, setLaster] = useState(false);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await loadGoal();
      if (stored) setGoal(stored);
    })();
  }, []);

  const pace = useMemo(() => {
    return computePace({
      startDate: goal.startDate,
      endDate: goal.endDate,
      startValue: Number(goal.startValue),
      targetValue: Number(goal.targetValue),
      currentValue: Number(goal.currentValue),
    });
  }, [goal]);

  const velgFraGalleri = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Tilgang", "Gi tilgang til bildegalleriet for å velge utgangsbilde.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.[0]) {
      setBildeUri(result.assets[0].uri);
      setAiBilde(null);
      setDisclaimer("");
    }
  };

  const genererAiVisualisering = async () => {
    if (!maal.trim()) {
      Alert.alert("Mangler mål", "Skriv inn et mål eller fokusområde.");
      return;
    }
    if (!bildeUri) {
      Alert.alert(
        "Mangler bilde",
        "Velg et utgangsbilde først. Uten bilde kan ikke AI beholde ansiktet ditt."
      );
      return;
    }

    setLaster(true);
    try {
      const result = await generateFutureYou({
        imageUri: bildeUri,
        maal: maal.trim(),
        intensity,
      });
      setAiBilde(result.uri);
      setDisclaimer(result.disclaimer || "");
    } catch (error) {
      Alert.alert(
        "Kunne ikke generere",
        `${error.message}\n\nSjekk at API-serveren kjører (${API_BASE_URL}) og at REPLICATE_API_TOKEN er satt i server/.env`
      );
    } finally {
      setLaster(false);
    }
  };

  const lagreMaal = async () => {
    setSavingGoal(true);
    try {
      await saveGoal(goal);
      Alert.alert("Lagret", "Mål og tempo er lagret på enheten.");
    } catch {
      Alert.alert("Feil", "Kunne ikke lagre målet.");
    } finally {
      setSavingGoal(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>HELSEAPP</Text>
        <Text style={styles.tagline}>Se resultatet. Hold tempoet.</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(item.id)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === "visual" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fremtidig deg</Text>
            <Text style={styles.sectionCopy}>
              Last opp et bilde av deg. AI redigerer det samme bildet mot målet ditt — ikke et
              tilfeldig generert menneske.
            </Text>

            <Text style={styles.label}>Mål / fokus</Text>
            <TextInput
              style={styles.input}
              value={maal}
              onChangeText={setMaal}
              placeholder="f.eks. mer styrke og definisjon"
              placeholderTextColor="#7a8278"
            />

            <Text style={styles.label}>Intensitet</Text>
            <View style={styles.row}>
              {[
                { id: "subtle", label: "Mild" },
                { id: "moderate", label: "Moderat" },
                { id: "strong", label: "Sterk" },
              ].map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chip, intensity === item.id && styles.chipActive]}
                  onPress={() => setIntensity(item.id)}
                >
                  <Text
                    style={[styles.chipText, intensity === item.id && styles.chipTextActive]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.secondaryBtn} onPress={velgFraGalleri}>
              <Text style={styles.secondaryBtnText}>Velg utgangsbilde</Text>
            </TouchableOpacity>

            {(bildeUri || aiBilde) && (
              <View style={styles.compare}>
                {bildeUri ? (
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>Nå</Text>
                    <Image source={{ uri: bildeUri }} style={styles.compareImage} />
                  </View>
                ) : null}
                {aiBilde ? (
                  <View style={styles.compareCol}>
                    <Text style={styles.compareLabel}>Målbilde</Text>
                    <Image source={{ uri: aiBilde }} style={styles.compareImage} />
                  </View>
                ) : null}
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, laster && styles.btnDisabled]}
              onPress={genererAiVisualisering}
              disabled={laster}
            >
              {laster ? (
                <ActivityIndicator color="#0c120c" />
              ) : (
                <Text style={styles.primaryBtnText}>Generer visualisering</Text>
              )}
            </TouchableOpacity>

            {disclaimer ? <Text style={styles.disclaimer}>{disclaimer}</Text> : null}
            <Text style={styles.hint}>API: {API_BASE_URL}</Text>
          </View>
        )}

        {tab === "pace" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tempo mot målet</Text>
            <Text style={styles.sectionCopy}>
              Appen sier fra om du er dager foran eller bak planen — før du mister momentum.
            </Text>

            <View
              style={[
                styles.paceCard,
                pace.status === "ahead" && styles.paceAhead,
                pace.status === "behind" && styles.paceBehind,
              ]}
            >
              <Text style={styles.paceLabel}>{pace.label}</Text>
              <Text style={styles.paceMeta}>
                Forventet nå: {pace.expectedValue} · Faktisk: {goal.currentValue} · Mål:{" "}
                {goal.targetValue}
              </Text>
              <Text style={styles.paceMeta}>
                Fremgang {pace.progressPct}% · {pace.remainingDays} dager igjen
              </Text>
            </View>

            <Text style={styles.label}>Måltittel</Text>
            <TextInput
              style={styles.input}
              value={goal.title}
              onChangeText={(title) => setGoal((g) => ({ ...g, title }))}
              placeholderTextColor="#7a8278"
            />

            <Text style={styles.label}>Metrikk</Text>
            <TextInput
              style={styles.input}
              value={goal.metricLabel}
              onChangeText={(metricLabel) => setGoal((g) => ({ ...g, metricLabel }))}
              placeholderTextColor="#7a8278"
            />

            <View style={styles.grid2}>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Startverdi</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(goal.startValue)}
                  onChangeText={(startValue) => setGoal((g) => ({ ...g, startValue }))}
                  placeholderTextColor="#7a8278"
                />
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Målverdi</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={String(goal.targetValue)}
                  onChangeText={(targetValue) => setGoal((g) => ({ ...g, targetValue }))}
                  placeholderTextColor="#7a8278"
                />
              </View>
            </View>

            <Text style={styles.label}>Nåværende verdi</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={String(goal.currentValue)}
              onChangeText={(currentValue) => setGoal((g) => ({ ...g, currentValue }))}
              placeholderTextColor="#7a8278"
            />

            <View style={styles.grid2}>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Startdato (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={goal.startDate}
                  onChangeText={(startDate) => setGoal((g) => ({ ...g, startDate }))}
                  placeholderTextColor="#7a8278"
                />
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Frist (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={goal.endDate}
                  onChangeText={(endDate) => setGoal((g) => ({ ...g, endDate }))}
                  placeholderTextColor="#7a8278"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, savingGoal && styles.btnDisabled]}
              onPress={lagreMaal}
              disabled={savingGoal}
            >
              <Text style={styles.primaryBtnText}>
                {savingGoal ? "Lagrer..." : "Lagre mål"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {tab === "devices" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Helseenheter</Text>
            <Text style={styles.sectionCopy}>
              Neste steg: én lisensiert datadeler (Terra eller Vital) for Garmin, Strava, Oura,
              Health Connect, Samsung Health m.fl. — uten å bygge hver SDK selv.
            </Text>

            {[
              "Garmin",
              "Strava",
              "Oura",
              "Health Connect",
              "Samsung Health",
            ].map((name) => (
              <View key={name} style={styles.deviceRow}>
                <Text style={styles.deviceName}>{name}</Text>
                <Text style={styles.deviceStatus}>Kommer via aggregator</Text>
              </View>
            ))}

            <Text style={styles.hint}>
              Når API-nøkler for Terra/Vital er klare, kobles OAuth her og mater Tempo-fanen
              automatisk.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#10140f" },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "#161c15",
    borderBottomWidth: 1,
    borderBottomColor: "#243022",
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#e8f0e2",
  },
  tagline: { marginTop: 4, color: "#9aab92", fontSize: 14 },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1a2119",
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#c6f26d" },
  tabText: { color: "#b7c4ae", fontWeight: "600" },
  tabTextActive: { color: "#10140f" },
  content: { padding: 20, paddingBottom: 48 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 22, fontWeight: "700", color: "#eef5e8" },
  sectionCopy: { color: "#a3b39a", marginBottom: 8, lineHeight: 20 },
  label: { color: "#c5d3bc", fontSize: 13, marginTop: 8 },
  input: {
    backgroundColor: "#1a2119",
    color: "#eef5e8",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2a3528",
  },
  row: { flexDirection: "row", gap: 8, marginBottom: 4 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1a2119",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a3528",
  },
  chipActive: { backgroundColor: "#243022", borderColor: "#c6f26d" },
  chipText: { color: "#a3b39a", fontWeight: "600" },
  chipTextActive: { color: "#c6f26d" },
  secondaryBtn: {
    marginTop: 8,
    backgroundColor: "#243022",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#e8f0e2", fontWeight: "700" },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: "#c6f26d",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    minHeight: 50,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#10140f", fontWeight: "800", fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  compare: { flexDirection: "row", gap: 12, marginTop: 12 },
  compareCol: { flex: 1, alignItems: "center" },
  compareLabel: { color: "#9aab92", marginBottom: 6, fontSize: 12 },
  compareImage: {
    width: "100%",
    aspectRatio: 9 / 16,
    borderRadius: 12,
    backgroundColor: "#1a2119",
  },
  disclaimer: { color: "#8f9f86", fontSize: 12, marginTop: 8, lineHeight: 18 },
  hint: { color: "#6f7c68", fontSize: 11, marginTop: 10 },
  paceCard: {
    backgroundColor: "#1a2119",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2a3528",
    marginBottom: 8,
  },
  paceAhead: { borderColor: "#c6f26d", backgroundColor: "#1d2a16" },
  paceBehind: { borderColor: "#e3a15c", backgroundColor: "#2a2116" },
  paceLabel: { color: "#eef5e8", fontSize: 18, fontWeight: "700", marginBottom: 6 },
  paceMeta: { color: "#a3b39a", fontSize: 13, lineHeight: 18 },
  grid2: { flexDirection: "row", gap: 10 },
  gridItem: { flex: 1 },
  deviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1a2119",
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#2a3528",
  },
  deviceName: { color: "#eef5e8", fontWeight: "600" },
  deviceStatus: { color: "#8f9f86", fontSize: 12 },
});
