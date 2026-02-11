import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, StyleSheet } from "react-native";
import LogSightingScreen from "./src/screens/LogSightingScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import MapScreen from "./src/screens/MapScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: "#16a34a",
          tabBarInactiveTintColor: "#64748b",
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tab.Screen
          name="Log"
          component={LogSightingScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <Text style={styles.tabIcon}>{focused ? "🎯" : "🎯"}</Text>
            ),
            tabBarLabel: "Log Sighting",
          }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <Text style={styles.tabIcon}>{focused ? "🗺️" : "🗺️"}</Text>
            ),
            tabBarLabel: "Map",
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: ({ focused }) => (
              <Text style={styles.tabIcon}>{focused ? "📋" : "📋"}</Text>
            ),
            tabBarLabel: "History",
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#1e293b",
    borderTopColor: "#334155",
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  tabIcon: {
    fontSize: 22,
  },
});
