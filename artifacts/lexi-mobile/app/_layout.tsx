import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DebugErrorOverlay } from "@/components/DebugErrorOverlay";
import { RootModeProvider } from "@/lib/root-mode";
import { installGlobalErrorHandlers } from "@/lib/global-error-log";

// Install BEFORE anything else so we capture init-time crashes too.
installGlobalErrorHandlers();

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [splashHidden, setSplashHidden] = useState(false);

  // Unconditional splash hide — runs once on mount and again whenever fonts
  // settle. Wrapped in try/finally so the splash ALWAYS disappears, even if
  // any startup work (font load, network probe, hydration) fails or hangs.
  // A 2s safety timeout guarantees the user is never stuck on the logo.
  useEffect(() => {
    let cancelled = false;
    const hide = async () => {
      try {
        // Place for any startup probe that should not block the UI.
      } catch {
        // swallow — the splash must never be held by a failed startup task
      } finally {
        if (cancelled) return;
        try { await SplashScreen.hideAsync(); } catch {}
        setSplashHidden(true);
      }
    };
    if (fontsLoaded || fontError) {
      void hide();
    } else {
      const t = setTimeout(() => { void hide(); }, 2000);
      return () => { cancelled = true; clearTimeout(t); };
    }
    return () => { cancelled = true; };
  }, [fontsLoaded, fontError]);

  if (!splashHidden && !fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0d1117" }}>
            <KeyboardProvider>
              <RootModeProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
                <DebugErrorOverlay />
              </RootModeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
