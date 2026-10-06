import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";
import { useLanguage } from "@/src/lib/i18n";

export default function TabsLayout() {
  const { t } = useLanguage();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: theme.color.surfaceSecondary,
          borderTopColor: theme.color.border,
          borderTopWidth: 1,
          height: 68,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="vault"
        options={{
          title: t("vault"),
          tabBarIcon: ({ color }) => <Feather name="shield" size={22} color={color} />,
          tabBarButtonTestID: "tab-vault",
        }}
      />
      <Tabs.Screen
        name="generator"
        options={{
          title: t("generator"),
          tabBarIcon: ({ color }) => <Feather name="hash" size={22} color={color} />,
          tabBarButtonTestID: "tab-generator",
        }}
      />
      <Tabs.Screen
        name="security"
        options={{
          title: t("securityTab"),
          tabBarIcon: ({ color }) => <Feather name="activity" size={22} color={color} />,
          tabBarButtonTestID: "tab-security",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
          tabBarButtonTestID: "tab-settings",
        }}
      />
    </Tabs>
  );
}
