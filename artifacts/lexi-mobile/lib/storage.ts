import AsyncStorage from "@react-native-async-storage/async-storage";

export const storage = {
  async getJSON<T>(key: string, fallback: T): Promise<T> {
    try {
      const v = await AsyncStorage.getItem(key);
      if (v == null) return fallback;
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  },
  async setJSON(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  async getString(key: string, fallback = ""): Promise<string> {
    try {
      return (await AsyncStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  async setString(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {}
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};

export function randomId(bytes = 12): string {
  let out = "";
  for (let i = 0; i < bytes; i++) {
    const b = Math.floor(Math.random() * 256);
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}
