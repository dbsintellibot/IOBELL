import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Bell, Clock, Calendar, Zap, AlertTriangle, LogOut } from 'lucide-react-native';

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { schoolId } = useAuth();
  const [nextBell, setNextBell] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<string>('Loading...');
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (schoolId) {
      loadCachedData();
      fetchDashboardData();
    }
  }, [schoolId]);

  if (!schoolId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <View style={[styles.headerIcon, { backgroundColor: '#fee2e2' }]}>
          <AlertTriangle color="#ef4444" size={32} />
        </View>
        <Text style={[styles.schoolName, { marginBottom: 8 }]}>Account Not Configured</Text>
        <Text style={{ textAlign: 'center', color: '#64748b', marginBottom: 24 }}>
          Your account is not associated with any school. Please contact your administrator to assign a school to your account.
        </Text>
        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={[styles.changeButton, { borderColor: '#ef4444' }]}>
          <Text style={[styles.buttonText, { color: '#ef4444' }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const loadCachedData = async () => {
    if (!schoolId) return;
    try {
      const cachedProfile = await AsyncStorage.getItem(`school_${schoolId}_dashboard_activeProfile`);
      const cachedProfileId = await AsyncStorage.getItem(`school_${schoolId}_activeProfileId`);
      const cachedNextBell = await AsyncStorage.getItem(`school_${schoolId}_dashboard_nextBell`);
      if (cachedProfile) setActiveProfile(cachedProfile);
      if (cachedProfileId) setActiveProfileId(cachedProfileId);
      if (cachedNextBell) setNextBell(cachedNextBell);
    } catch (e) {
      // ignore error
    }
  };

  const fetchDashboardData = async () => {
    if (!schoolId) return;
    setRefreshing(true);
    try {
      // 1. Fetch Profiles
      const { data: profiles, error: profileError } = await supabase
        .from('bell_profiles')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('name');

      if (profileError) throw profileError;

      if (!profiles || profiles.length === 0) {
        setActiveProfile('No Profiles');
        setNextBell('--:--');
        setActiveProfileId(null);
        return;
      }

      // Determine target profile ID (use cached if valid, else first)
      let targetProfileId = activeProfileId;
      if (!targetProfileId || !profiles.find(p => p.id === targetProfileId)) {
        targetProfileId = profiles[0].id;
      }

      const selected = profiles.find(p => p.id === targetProfileId)!;
      
      // Update state immediately for profile
      setActiveProfile(selected.name);
      setActiveProfileId(selected.id);
      AsyncStorage.setItem(`school_${schoolId}_dashboard_activeProfile`, selected.name);
      AsyncStorage.setItem(`school_${schoolId}_activeProfileId`, selected.id);

      // 2. Fetch Bells for the target profile
      const today = new Date().getDay();
      const { data: bells, error: bellError } = await supabase
        .from('bell_times')
        .select('bell_time')
        .eq('profile_id', selected.id)
        .contains('day_of_week', [today])
        .order('bell_time', { ascending: true });

      if (bellError) throw bellError;

      if (bells && bells.length > 0) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`;
        const next = bells.find(b => b.bell_time > currentTime);
        const nextBellTime = next ? next.bell_time.substring(0, 5) : 'Done'; // Trim seconds
        setNextBell(nextBellTime);
        AsyncStorage.setItem(`school_${schoolId}_dashboard_nextBell`, nextBellTime);
      } else {
        setNextBell('--:--');
      }

    } catch (error) {
      console.error(error);
      if (activeProfile === 'Loading...') setActiveProfile('Error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchDashboardData} />}
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
           <Bell color="#2563EB" size={32} />
        </View>
        <Text style={styles.schoolName}>AutoBell Dashboard</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Clock color="#64748b" size={20} />
          <Text style={styles.cardTitle}>Next Bell</Text>
        </View>
        <Text style={styles.bigText}>{nextBell || '--:--'}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Calendar color="#64748b" size={20} />
          <Text style={styles.cardTitle}>Active Profile</Text>
        </View>
        <Text style={styles.profileText}>{activeProfile}</Text>
        <TouchableOpacity 
          style={styles.changeButton}
          onPress={() => navigation.navigate('ProfileSwitcher')}
        >
          <Text style={styles.buttonText}>Change Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsGrid}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.manualButton]}
          onPress={() => navigation.navigate('ManualTrigger')}
        >
          <Zap color="white" size={32} style={{ marginBottom: 8 }} />
          <Text style={styles.actionButtonText}>Manual Trigger</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.emergencyButton]}
          onPress={() => navigation.navigate('Emergency')}
        >
          <AlertTriangle color="white" size={32} style={{ marginBottom: 8 }} />
          <Text style={styles.actionButtonText}>EMERGENCY</Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.logoutButton}>
          <LogOut color="gray" size={20} style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f1f5f9',
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  schoolName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginLeft: 8,
  },
  bigText: {
    fontSize: 56,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 2,
  },
  profileText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 16,
  },
  changeButton: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  buttonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    flex: 0.48,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  manualButton: {
    backgroundColor: '#f59e0b',
  },
  emergencyButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  logoutButton: {
      marginTop: 20,
      flexDirection: 'row',
      alignSelf: 'center',
      alignItems: 'center',
      padding: 10,
  },
  logoutText: {
      color: 'gray',
      fontSize: 16,
      fontWeight: '500',
  }
});
