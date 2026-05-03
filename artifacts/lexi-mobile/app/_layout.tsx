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
import { RootModeProvider } from "@/lib/root-mode";

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

  // Hide the splash as soon as fonts settle OR after a 2.5s hard timeout.
  // Without the timeout, an upgrade-install where the bundled font asset
  // cache is in a weird state can leave useFonts pending forever and the
  // splash never hides — the symptom the user reported after sideloading
  // the new APK over an existing install. We never want to be stuck on
  // the logo screen, so always force-hide and fall back to system fonts.
  useEffect(() => {
    let cancelled = false;
    const hide = () => {
      if (cancelled) return;
      SplashScreen.hideAsync().catch(() => {});
      setSplashHidden(true);
    };
    if (fontsLoaded || fontError) {
      hide();
    } else {
      const t = setTimeout(hide, 2500);
      return () => { cancelled = true; clearTimeout(t); };
    }
  }, [fontsLoaded, fontError]);

  // Render the app even if fonts haven't finished loading. RN will fall
  // back to the platform's system font for any text styled with our Inter
  // family until the bundled font finishes loading or fails. This is far
  // better than an indefinitely blank splash screen.
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
              </RootModeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
