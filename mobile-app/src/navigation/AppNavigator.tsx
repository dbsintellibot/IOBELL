import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Calendar, Music, HardDrive, Settings } from 'lucide-react-native';

// Screens
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ManualTriggerScreen from '../screens/ManualTriggerScreen';
import EmergencyScreen from '../screens/EmergencyScreen';
import ProfileSwitcherScreen from '../screens/ProfileSwitcherScreen';
import ProfileManagementScreen from '../screens/ProfileManagementScreen';
import ProfileEditorScreen from '../screens/ProfileEditorScreen';
import AudioManagerScreen from '../screens/AudioManagerScreen';
import DeviceListScreen from '../screens/DeviceListScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          paddingBottom: 4,
          paddingTop: 4,
        },
      }}
    >
      <Tab.Screen 
        name="DashboardTab" 
        component={DashboardScreen} 
        options={{ 
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />
        }} 
      />
      <Tab.Screen 
        name="ProfilesTab" 
        component={ProfileManagementScreen} 
        options={{ 
          title: 'Profiles',
          tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />
        }} 
      />
      <Tab.Screen 
        name="AudioTab" 
        component={AudioManagerScreen} 
        options={{ 
          title: 'Audio',
          tabBarIcon: ({ color, size }) => <Music color={color} size={size} />
        }} 
      />
      <Tab.Screen 
        name="DevicesTab" 
        component={DeviceListScreen} 
        options={{ 
          title: 'Devices',
          tabBarIcon: ({ color, size }) => <HardDrive color={color} size={size} />
        }} 
      />
      <Tab.Screen 
        name="SettingsTab" 
        component={SettingsScreen} 
        options={{ 
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />
        }} 
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {session ? (
          <>
            <Stack.Screen 
              name="MainTabs" 
              component={MainTabs} 
              options={{ headerShown: false }} 
            />
            <Stack.Screen 
              name="ProfileEditor" 
              component={ProfileEditorScreen} 
              options={{ title: 'Edit Profile' }} 
            />
            <Stack.Screen 
              name="ManualTrigger" 
              component={ManualTriggerScreen} 
              options={{ title: 'Manual Trigger' }} 
            />
            <Stack.Screen 
              name="Emergency" 
              component={EmergencyScreen} 
              options={{ 
                title: 'Emergency', 
                headerStyle: { backgroundColor: '#FEE2E2' },
                headerTintColor: '#991B1B'
              }} 
            />
            <Stack.Screen 
              name="ProfileSwitcher" 
              component={ProfileSwitcherScreen} 
              options={{ title: 'Switch Profile' }} 
            />
          </>
        ) : (
          <Stack.Screen 
            name="Login" 
            component={LoginScreen} 
            options={{ headerShown: false }} 
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
