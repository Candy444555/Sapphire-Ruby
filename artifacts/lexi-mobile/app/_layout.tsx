import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DebugErrorOverlay } from "@/components/DebugErrorOverlay";
import { NavLogger } from "@/components/NavLogger";
import { RootModeProvider } from "@/lib/root-mode";
import { installGlobalErrorHandlers } from "@/lib/global-error-log";
import { installNetworkInstrumentation, log, loadSettings, rotateRetention } from "@/lib/logger";

// Install BEFORE anything else so we capture init-time crashes too.
installGlobalErrorHandlers();
installNetworkInstrumentation();
loadSettings()
  .then(() => rotateRetention())
  .then(() => log.info("app", "boot", { actor: "system", status: "ready" }))
  .catch(() => {});

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Fonts load in the background; we never block render on them. RN falls
  // back to the system font until they're ready, so the UI is interactive
  // from the first frame.
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0d1117" }}>
            <KeyboardProvider>
              <RootModeProvider>
                <StatusBar style="light" />
                <NavLogger />
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
