// Android Keystore-backed secure storage for operator credentials.
//
// expo-secure-store stores values in EncryptedSharedPreferences on Android,
// which is itself backed by an AES-GCM key sealed inside the AndroidKeystore.
// Falls back to AsyncStorage ONLY when explicitly running in the Expo Go web
// playground (Platform.OS === "web") so credentials in any real Android
// build always go through Keystore.
import { Platform } from "react-native";

type SecureLike = {
  getItemAsync(k: string): Promise<string | null>;
  setItemAsync(k: string, v: string): Promise<void>;
  deleteItemAsync(k: string): Promise<void>;
};

let impl: SecureLike | null = null;
let webFallbackWarned = false;

async function load(): Promise<SecureLike> {
  if (impl) return impl;
  if (Platform.OS === "web") {
    if (!webFallbackWarned) {
      // eslint-disable-next-line no-console
      console.warn("[lexi:secure-store] web fallback in use — credentials are NOT keystore-backed in the web preview.");
      webFallbackWarned = true;
    }
    impl = {
      async getItemAsync(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
      async setItemAsync(k, v) { try { globalThis.localStorage?.setItem(k, v); } catch {} },
      async deleteItemAsync(k) { try { globalThis.localStorage?.removeItem(k); } catch {} },
    };
    return impl;
  }
  try {
    const mod = (await import("expo-secure-store")) as SecureLike;
    impl = mod;
    return impl;
  } catch (e) {
    throw new Error(
      "SECURE_STORE_NOT_BUNDLED: expo-secure-store isn't installed. Run `pnpm --filter @workspace/lexi-mobile add expo-secure-store` and rebuild the APK. Operator credentials must be Keystore-backed."
    );
  }
}

export async function secureGet(key: string): Promise<string | null> {
  return (await load()).getItemAsync(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  await (await load()).setItemAsync(key, value);
}

export async function secureDelete(key: string): Promise<void> {
  await (await load()).deleteItemAsync(key);
}
