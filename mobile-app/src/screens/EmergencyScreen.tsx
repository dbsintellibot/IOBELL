import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Vibration } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function EmergencyScreen() {
  const { schoolId } = useAuth();

  const handlePress = () => {
    Alert.alert(
      'CONFIRM EMERGENCY',
      'Pressing continue will broadcast the emergency alarm to ALL devices in this school immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue And Broadcast Alarm', 
          style: 'destructive', 
          onPress: triggerEmergency 
        },
      ]
    );
  };

  const triggerEmergency = async () => {
    if (!schoolId) return;

    // Vibrate to give feedback
    Vibration.vibrate(500);

    try {
      // Fetch all devices for the school
      const { data: devices } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId);

      if (devices && devices.length > 0) {
        // Insert EMERGENCY commands into command_queue
        // Note: Current firmware uses 'RING' or 'TEST_BUZZER'. 
        // We use 'RING' as it plays audio.
        const commands = devices.map(d => ({
          device_id: d.id,
          command: 'RING', 
          payload: { 
            message: 'EMERGENCY TRIGGERED',
            timestamp: new Date().toISOString(),
            quiet_hours_override: true
          },
          status: 'pending'
        }));

        const { error } = await supabase.from('command_queue').insert(commands);
        
        if (error) throw error;
        
        Alert.alert('BROADCASTING', 'Emergency signal sent to all devices.');
      } else {
        Alert.alert('Error', 'No devices found for this school.');
      }
    } catch (error) {
      console.error('Emergency broadcast error:', error);
      Alert.alert('Error', 'Failed to broadcast emergency signal.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EMERGENCY BROADCAST</Text>
      <Text style={styles.warning}>
        Pressing the button below will trigger the alarm on all school bells immediately.
      </Text>

      <TouchableOpacity 
        style={styles.bigRedButton} 
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>ALARM</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#fff0f0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#c0392b',
    marginBottom: 20,
    textAlign: 'center',
  },
  warning: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 50,
    lineHeight: 24,
  },
  bigRedButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#c0392b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    borderWidth: 4,
    borderColor: '#c0392b',
  },
  buttonText: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
  },
});
