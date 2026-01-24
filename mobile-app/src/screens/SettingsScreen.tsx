import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { LogOut, Bell, ShieldAlert, User } from 'lucide-react-native';

export default function SettingsScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error', error.message);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
            <Text style={styles.avatarText}>{session?.user?.email?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.email}>{session?.user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Controls</Text>
        
        <TouchableOpacity 
          style={styles.item}
          onPress={() => navigation.navigate('ProfileSwitcher')}
        >
          <View style={styles.itemLeft}>
            <Bell size={20} color="#4B5563" />
            <Text style={styles.itemText}>Switch Active Profile</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.item}
          onPress={() => navigation.navigate('ManualTrigger')}
        >
          <View style={styles.itemLeft}>
            <Bell size={20} color="#4B5563" />
            <Text style={styles.itemText}>Manual Trigger</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.item}
          onPress={() => navigation.navigate('Emergency')}
        >
          <View style={styles.itemLeft}>
            <ShieldAlert size={20} color="#DC2626" />
            <Text style={[styles.itemText, { color: '#DC2626' }]}>Emergency Stop</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity 
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  email: {
    fontSize: 16,
    color: '#374151',
  },
  section: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    padding: 16,
    paddingBottom: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemText: {
    fontSize: 16,
    color: '#1F2937',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
});
