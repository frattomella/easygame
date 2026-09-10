import { createNavigationContainerRef } from "@react-navigation/native";

import type { RootStackParamList } from "@/navigation/RootStackNavigator";

/**
 * Riferimento imperativo al `NavigationContainer` (WP11): serve al
 * risolutore di deep link per navigare da fuori dell'albero React che sta
 * mostrando in quel momento — un URL puo arrivare mentre l'app e su
 * qualunque schermata, non solo su quella che l'ha aperto.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
