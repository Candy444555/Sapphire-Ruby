import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === "web";
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          ...(isWeb ? { height: 64 } : {}),
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Chat", tabBarIcon: ({ color }) => <Feather name="message-circle" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="terminal"
        options={{ title: "Terminal", tabBarIcon: ({ color }) => <Feather name="terminal" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="github"
        options={{ title: "GitHub", tabBarIcon: ({ color }) => <Feather name="github" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="software"
        options={{ title: "Software", tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="upload"
        options={{ title: "Upload", tabBarIcon: ({ color }) => <Feather name="upload-cloud" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: "Scan", tabBarIcon: ({ color }) => <Feather name="shield" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="tools"
        options={{ title: "Tools", tabBarIcon: ({ color }) => <Feather name="unlock" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="android"
        options={{ title: "Android", tabBarIcon: ({ color }) => <Feather name="cpu" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="apple"
        options={{ title: "Apple", tabBarIcon: ({ color }) => <Feather name="smartphone" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="usb"
        options={{ title: "USB", tabBarIcon: ({ color }) => <Feather name="link-2" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="logs"
        options={{ title: "Logs", tabBarIcon: ({ color }) => <Feather name="list" size={22} color={color} /> }}
      />
    </Tabs>
  );
}
