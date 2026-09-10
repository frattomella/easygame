import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SecureStorage } from "./secure-storage";

/**
 * Variante Web di `secure-storage.ts` (Metro la risolve al posto dell'altra
 * solo per `platform: "web"`, stesso meccanismo di `useColorScheme.web.ts`).
 *
 * ATTENZIONE — NON E SICURA: `expo-secure-store` non ha alcun equivalente
 * nel browser (niente Keychain/Keystore), quindi qui sotto c'e
 * `AsyncStorage` (che sul Web e `localStorage`), la stessa scelta gia in uso
 * altrove in questo albero per dati non sensibili. Il token resta in
 * chiaro nello storage del browser: accettabile solo per far girare
 * l'app in locale durante lo sviluppo su Expo Web, mai per l'app nativa
 * (iOS/Android continuano a usare `expo-secure-store` invariato) e mai
 * come target di produzione.
 */
export const secureStorage: SecureStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  deleteItem: (key) => AsyncStorage.removeItem(key),
};
