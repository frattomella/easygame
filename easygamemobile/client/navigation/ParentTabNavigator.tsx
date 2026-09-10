import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import {
  ActionButton,
  AppBar,
  Dock,
  Floodlight,
  StateMessage,
} from "@/components/signature";
import { Spacing } from "@/constants/theme";
import { ParentProvider, useParentContext } from "@/contexts/ParentContext";
import { useAuthContext } from "@/contexts/AuthContext";
import ParentHomeStackNavigator from "@/navigation/ParentHomeStackNavigator";
import ParentCalendarStackNavigator from "@/navigation/ParentCalendarStackNavigator";
import ParentSegreteriaStackNavigator from "@/navigation/ParentSegreteriaStackNavigator";
import ParentBoardStackNavigator from "@/navigation/ParentBoardStackNavigator";
import ParentProfileStackNavigator from "@/navigation/ParentProfileStackNavigator";

export type ParentTabParamList = {
  ParentHomeTab: undefined;
  ParentCalendarTab: undefined;
  ParentSegreteriaTab: undefined;
  ParentBoardTab: undefined;
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
        <AppBar title="Area Genitore" eyebrow="EasyGame" />
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
          variant="onDark"
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
        name="ParentSegreteriaTab"
        component={ParentSegreteriaStackNavigator}
        options={{
          title: "Segreteria",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ParentBoardTab"
        component={ParentBoardStackNavigator}
        options={{
          title: "Bacheca",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone" size={size} color={color} />
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
