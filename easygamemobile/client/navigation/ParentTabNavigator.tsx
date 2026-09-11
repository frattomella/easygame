import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import {
  ActionButton,
  AppBar,
  BrandLine,
  Dock,
  Floodlight,
  StateMessage,
} from "@/components/signature";
import { Spacing } from "@/constants/theme";
import { ParentProvider, useParentContext } from "@/contexts/ParentContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { findFirstPayableParentPayment } from "@/lib/parent-payments";
import ParentHomeStackNavigator from "@/navigation/ParentHomeStackNavigator";
import ParentCalendarStackNavigator from "@/navigation/ParentCalendarStackNavigator";
import ParentPaymentsStackNavigator from "@/navigation/ParentPaymentsStackNavigator";
import ParentServicesStackNavigator from "@/navigation/ParentServicesStackNavigator";
import ParentProfileStackNavigator from "@/navigation/ParentProfileStackNavigator";

export type ParentTabParamList = {
  ParentHomeTab: undefined;
  ParentCalendarTab: undefined;
  ParentPaymentsTab: undefined;
  ParentServicesTab: undefined;
  ParentProfileTab: undefined;
};

const Tab = createBottomTabNavigator<ParentTabParamList>();

/**
 * Il guscio dell'area Parent (`ParentMain` in `RootStackNavigator`): monta
 * `ParentProvider` una sola volta cosi ogni tab condivide lo stesso figlio
 * selezionato, poi decide cosa mostrare in base allo stato del
 * multi-figlio — mai le cinque tab su un elenco vuoto (WP4, "gestione
 * nessun figlio").
 */
export default function ParentTabNavigator() {
  return (
    <ParentProvider>
      <ParentGate />
    </ParentProvider>
  );
}

function ParentGate() {
  const { status, errorMessage, reload } = useParentContext();

  if (status === "ready") {
    return <ParentTabs />;
  }

  if (status === "loading") {
    return (
      <ParentGateShell>
        <StateMessage kind="loading" tone="dark" />
      </ParentGateShell>
    );
  }

  if (status === "empty") {
    return (
      <ParentGateShell>
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessun figlio collegato"
          message="Il tuo account non risulta ancora collegato a nessun atleta. Contatta la segreteria del club per completare il collegamento."
        />
      </ParentGateShell>
    );
  }

  if (status === "forbidden") {
    return (
      <ParentGateShell>
        <StateMessage
          kind="forbidden"
          tone="dark"
          message={
            errorMessage || "Il tuo account non ha accesso all'area genitore."
          }
        />
      </ParentGateShell>
    );
  }

  return (
    <ParentGateShell>
      <StateMessage
        kind="error"
        tone="dark"
        message={errorMessage}
        actionLabel="Riprova"
        onAction={reload}
      />
    </ParentGateShell>
  );
}

/** Il guscio comune degli stati non "ready": niente switcher (non c'e ancora un figlio da mostrare), ma sempre una via d'uscita verso l'Account Hub. */
function ParentGateShell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { clearContext } = useAuthContext();

  return (
    <Floodlight>
      <View style={{ paddingTop: insets.top + Spacing.sm }}>
        <BrandLine club={null} />
        <AppBar title="Area Genitore" eyebrow="Genitore" />
      </View>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: Spacing.lg,
          gap: Spacing.lg,
        }}
      >
        {children}
        <ActionButton
          variant="primary"
          onSky
          size="sm"
          onPress={() => void clearContext()}
        >
          Cambia club o accesso
        </ActionButton>
      </View>
    </Floodlight>
  );
}

function ParentTabs() {
  const { selectedChildId } = useParentContext();
  // Stessa query key delle cinque tab: nessuna fetch in piu. Il pallino sul
  // Dock (design §2b, "Dock badge": 8px con bordo navy, mai un numero) dice
  // solo che c'e una rata da saldare — il conteggio vive sulla tile della Home.
  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const hasPayable = Boolean(
    dashboardQuery.data &&
      findFirstPayableParentPayment(dashboardQuery.data.payments.items),
  );

  return (
    <Tab.Navigator
      tabBar={(props) => <Dock {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="ParentHomeTab"
        component={ParentHomeStackNavigator}
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ParentCalendarTab"
        component={ParentCalendarStackNavigator}
        options={{
          title: "Calendario",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ParentPaymentsTab"
        component={ParentPaymentsStackNavigator}
        options={{
          title: "Pagamenti",
          tabBarBadge: hasPayable ? "•" : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ParentServicesTab"
        component={ParentServicesStackNavigator}
        options={{
          title: "Servizi",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ParentProfileTab"
        component={ParentProfileStackNavigator}
        options={{
          title: "Profilo",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
