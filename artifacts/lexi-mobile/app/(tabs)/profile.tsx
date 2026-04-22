import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

export default function ProfileScreen() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#F5F9FC" />
        </Pressable>
        <Text style={styles.title}>Account</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        {isLoading ? (
          <ActivityIndicator color="#F26207" size="large" />
        ) : isAuthenticated && user ? (
          <View style={styles.card}>
            {user.profileImageUrl ? (
              <Image
                source={{ uri: user.profileImageUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="user" size={32} color="#F26207" />
              </View>
            )}

            <Text style={styles.name}>
              {[user.firstName, user.lastName].filter(Boolean).join(" ") ||
                "User"}
            </Text>
            {user.email ? (
              <Text style={styles.email}>{user.email}</Text>
            ) : null}

            <View style={styles.badge}>
              <Feather name="check-circle" size={14} color="#56D364" />
              <Text style={styles.badgeText}>Signed in — all features free</Text>
            </View>

            <Pressable style={styles.logoutBtn} onPress={logout}>
              <Feather name="log-out" size={16} color="#F73E3E" />
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.avatarPlaceholder}>
              <Feather name="user" size={32} color="#9DA2A6" />
            </View>

            <Text style={styles.name}>Not signed in</Text>
            <Text style={styles.sub}>
              Sign in to sync your preferences across devices. All features are
              completely free.
            </Text>

            <Pressable style={styles.loginBtn} onPress={login}>
              <Feather name="log-in" size={16} color="#fff" />
              <Text style={styles.loginText}>Sign in</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0E1525",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1C2333",
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#0E1525",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1C2333",
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 4,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1C2333",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  name: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  email: {
    color: "#C2C8CC",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  sub: {
    color: "#C2C8CC",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1C2333",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  badgeText: {
    color: "#56D364",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F26207",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
    width: "100%",
    justifyContent: "center",
  },
  loginText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#2B3245",
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
    width: "100%",
    justifyContent: "center",
    backgroundColor: "#1C2333",
  },
  logoutText: {
    color: "#F73E3E",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
