import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ManualTriggerScreen from '../screens/ManualTriggerScreen';
import EmergencyScreen from '../screens/EmergencyScreen';
import ProfileSwitcherScreen from '../screens/ProfileSwitcherScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {session ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="ManualTrigger" component={ManualTriggerScreen} options={{ title: 'Manual Trigger' }} />
            <Stack.Screen name="Emergency" component={EmergencyScreen} options={{ title: 'Emergency', headerStyle: { backgroundColor: '#ffcccc' } }} />
            <Stack.Screen name="ProfileSwitcher" component={ProfileSwitcherScreen} options={{ title: 'Switch Profile' }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
