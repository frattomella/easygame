import * as SecureStore from "expo-secure-store";

/**
 * Astrazione unica per il token, l'utente in cache e l'URL del backend
 * (`client/services/api.ts`, unico chiamante). Su iOS/Android e un guscio
 * sottile su `expo-secure-store` (Keychain/Keystore) — nessuna modifica al
 * modello di sicurezza nativo. La variante Web (`secure-storage.web.ts`,
 * risolta automaticamente da Metro sullo stesso import) esiste solo perche
 * `expo-secure-store` non ha un equivalente sicuro nel browser: nessun sito
 * web ha accesso a un keychain di sistema, quindi non esiste un modo di
 * rendere quell'API davvero sicura sul Web. La variante Web serve solo per
 * lo sviluppo/test locale in Expo Web, mai per l'app nativa.
 */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export const secureStorage: SecureStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};
