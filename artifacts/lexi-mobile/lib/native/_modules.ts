// Typed accessor for native modules so call-sites don't reach for
// `(NativeModules as any).Foo`. Returns `null` when the module isn't bundled.
import { NativeModules, Platform, type NativeModule } from "react-native";

export function getNativeModule<T extends NativeModule>(name: string, platforms: Array<typeof Platform.OS> = ["android"]): T | null {
  if (!platforms.includes(Platform.OS)) return null;
  const all = NativeModules as unknown as Record<string, NativeModule | undefined>;
  const mod = all[name];
  return (mod ?? null) as T | null;
}
